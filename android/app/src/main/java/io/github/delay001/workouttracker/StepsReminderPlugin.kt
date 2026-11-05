package io.github.delay001.workouttracker

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.activity.result.ActivityResult
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.util.concurrent.TimeUnit

// Напоминание «Пора пройтись»: раз в день в заданное время Android сам (без открытого приложения)
// читает шаги за сегодня из Health Connect и присылает уведомление, только если до цели не хватает.
// Для чтения без открытого приложения Health Connect требует отдельное разрешение «в фоне».
private const val PREFS = "steps_reminder"
private const val WORK = "steps_reminder"
private const val CHANNEL = "steps"
private const val NOTIFICATION_ID = 7302
private val PERMISSIONS = setOf(
    HealthPermission.getReadPermission(StepsRecord::class),
    "android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND",
)

object StepsReminder {
    // Следующий запуск — ближайшее «ЧЧ:ММ» хотя бы через минуту, чтобы проверка не повторилась сразу
    fun scheduleNext(context: Context, policy: ExistingWorkPolicy) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!prefs.getBoolean("on", false)) {
            WorkManager.getInstance(context).cancelUniqueWork(WORK)
            return
        }
        val time = LocalTime.parse(prefs.getString("time", "20:00"))
        val now = LocalDateTime.now()
        var next = LocalDate.now().atTime(time)
        if (next.isBefore(now.plusMinutes(1))) next = next.plusDays(1)
        val delay = Duration.between(now, next).toMillis()
        val request = OneTimeWorkRequestBuilder<StepsReminderWorker>()
            .setInitialDelay(delay, TimeUnit.MILLISECONDS)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(WORK, policy, request)
    }
}

class StepsReminderWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val prefs = applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        try {
            if (prefs.getBoolean("on", false)) {
                val client = HealthConnectClient.getOrCreate(applicationContext)
                val start = LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant()
                val result = client.aggregate(
                    AggregateRequest(setOf(StepsRecord.COUNT_TOTAL), TimeRangeFilter.between(start, Instant.now())),
                )
                val steps = result[StepsRecord.COUNT_TOTAL] ?: 0L
                val goal = prefs.getInt("goal", 10000)
                if (steps < goal) notify(prefs.getString("title", "") ?: "", prefs.getString("body", "") ?: "", goal - steps)
            }
        } catch (e: Exception) {
            // Нет разрешения или Health Connect недоступен: молчим, проверим завтра
        } finally {
            // Добавляется в очередь после текущей проверки, а не вместо нее
            StepsReminder.scheduleNext(applicationContext, ExistingWorkPolicy.APPEND_OR_REPLACE)
        }
        return Result.success()
    }

    @SuppressLint("MissingPermission")
    private fun notify(title: String, body: String, left: Long) {
        val context = applicationContext
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL, applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("channel", title), NotificationManager.IMPORTANCE_DEFAULT),
        )
        val openApp = PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val text = body.replace("#LEFT#", String.format("%,d", left))
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_dumbbell)
            .setContentTitle(title)
            .setContentText(text)
            .setContentIntent(openApp)
            .setAutoCancel(true)
            .build()
        if (NotificationManagerCompat.from(context).areNotificationsEnabled()) {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
        }
    }
}

@CapacitorPlugin(name = "StepsReminder")
class StepsReminderPlugin : Plugin() {
    // Настройки из приложения: включено, время, цель и тексты на языке приложения
    @PluginMethod
    fun schedule(call: PluginCall) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean("on", call.getBoolean("on") ?: false)
            .putString("time", call.getString("time") ?: "20:00")
            .putInt("goal", call.getInt("goal") ?: 10000)
            .putString("title", call.getString("title") ?: "")
            .putString("body", call.getString("body") ?: "")
            .putString("channel", call.getString("channelName") ?: "")
            .apply()
        StepsReminder.scheduleNext(context, ExistingWorkPolicy.REPLACE)
        call.resolve()
    }

    // available — Health Connect умеет отдавать данные в фоне; granted — шаги и чтение в фоне разрешены
    @PluginMethod
    fun status(call: PluginCall) {
        CoroutineScope(Dispatchers.Main).launch {
            call.resolve(currentStatus())
        }
    }

    @PluginMethod
    fun requestAccess(call: PluginCall) {
        val intent = PermissionController.createRequestPermissionResultContract().createIntent(context, PERMISSIONS)
        startActivityForResult(call, intent, "accessResult")
    }

    @ActivityCallback
    private fun accessResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        CoroutineScope(Dispatchers.Main).launch {
            call.resolve(currentStatus())
        }
    }

    private suspend fun currentStatus(): JSObject {
        val answer = JSObject()
        try {
            if (HealthConnectClient.getSdkStatus(context) != HealthConnectClient.SDK_AVAILABLE) {
                answer.put("available", false)
                answer.put("granted", false)
                return answer
            }
            val client = HealthConnectClient.getOrCreate(context)
            val available = client.features.getFeatureStatus(
                HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND,
            ) == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE
            answer.put("available", available)
            answer.put("granted", available && client.permissionController.getGrantedPermissions().containsAll(PERMISSIONS))
        } catch (e: Exception) {
            answer.put("available", false)
            answer.put("granted", false)
        }
        return answer
    }
}
