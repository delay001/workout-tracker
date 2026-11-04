package io.github.delay001.workouttracker;

import android.annotation.SuppressLint;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Секундомер тренировки в шторке: закрепленное уведомление, время в котором считает сам Android,
 * поэтому оно идет, даже когда приложение свернуто или выгружено. На паузе показывается остановленное время.
 */
@CapacitorPlugin(name = "WorkoutTimer")
public class WorkoutTimerPlugin extends Plugin {

    private static final String CHANNEL = "workout-timer";
    private static final int NOTIFICATION_ID = 7001;

    @SuppressLint("MissingPermission")
    @PluginMethod
    public void show(PluginCall call) {
        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL,
                call.getString("channelName", "Workout"),
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setShowBadge(false);
            context.getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }

        Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent openApp = PendingIntent.getActivity(
            context,
            0,
            open,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );
        long elapsedMs = call.getDouble("elapsedMs", 0.0).longValue();
        boolean running = Boolean.TRUE.equals(call.getBoolean("running", false));

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_dumbbell)
            .setContentTitle(call.getString("title", ""))
            .setContentText(call.getString("text", ""))
            .setContentIntent(openApp)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .setPriority(NotificationCompat.PRIORITY_LOW);
        if (running) {
            // Отсчет от момента «сейчас минус уже набежавшее время»: дальше Android тикает сам
            builder.setUsesChronometer(true).setShowWhen(true).setWhen(System.currentTimeMillis() - elapsedMs);
        } else {
            builder.setShowWhen(false);
        }

        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build());
            call.resolve();
        } catch (SecurityException error) {
            // Уведомления запрещены пользователем: секундомер в приложении работает и без шторки
            call.resolve();
        }
    }

    /** Экран не гаснет, пока открыта начатая тренировка. Флаг окна меняется только в главном потоке. */
    @PluginMethod
    public void keepAwake(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        getActivity().runOnUiThread(() -> {
            if (on) {
                getActivity().getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                getActivity().getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void hide(PluginCall call) {
        NotificationManagerCompat.from(getContext()).cancel(NOTIFICATION_ID);
        call.resolve();
    }
}
