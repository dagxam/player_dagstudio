package ru.dagstudio.player;

import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(DAGCarModePlugin.class);
        super.onCreate(savedInstanceState);
        // Use the whole display on TEYES CC3 and Android tablets/phones.
        // The layout remains the existing Capacitor WebView; only system chrome changes.
        getWindow().getDecorView().post(this::applyImmersiveMode);
    }

    @Override
    public void onResume() {
        super.onResume();
        applyImmersiveMode();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // OEM car launchers sometimes restore the status bar after a dialog/ACC wakeup.
        if (hasFocus) applyImmersiveMode();
    }

    @SuppressWarnings("deprecation")
    private void applyImmersiveMode() {
        final Window window = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false);
            final WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.setSystemBarsBehavior(
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                controller.hide(WindowInsets.Type.statusBars() |
                    WindowInsets.Type.navigationBars());
            }
        } else {
            window.setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN);
            final View decor = window.getDecorView();
            decor.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY |
                View.SYSTEM_UI_FLAG_FULLSCREEN |
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    @Override public boolean onKeyDown(int keyCode, KeyEvent event) {
        // Fallback for TEYES firmware that sends key events to the active
        // Activity instead of the Android MediaSession.
        if (event.getRepeatCount() == 0) {
            switch (keyCode) {
                case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                case KeyEvent.KEYCODE_HEADSETHOOK:
                    DAGCarModePlugin.notifyMediaCommand("toggle"); return true;
                case KeyEvent.KEYCODE_MEDIA_PLAY:
                    DAGCarModePlugin.notifyMediaCommand("play"); return true;
                case KeyEvent.KEYCODE_MEDIA_PAUSE:
                case KeyEvent.KEYCODE_MEDIA_STOP:
                    DAGCarModePlugin.notifyMediaCommand("pause"); return true;
                case KeyEvent.KEYCODE_MEDIA_NEXT:
                    DAGCarModePlugin.notifyMediaCommand("next"); return true;
                case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
                    DAGCarModePlugin.notifyMediaCommand("previous"); return true;
            }
        }
        return super.onKeyDown(keyCode, event);
    }
}
