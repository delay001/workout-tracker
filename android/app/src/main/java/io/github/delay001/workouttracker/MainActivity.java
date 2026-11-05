package io.github.delay001.workouttracker;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Свой модуль: таймер тренировки в шторке уведомлений
        registerPlugin(WorkoutTimerPlugin.class);
        // Свой модуль: напоминание «Пора пройтись», если цель по шагам не выполнена
        registerPlugin(StepsReminderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
