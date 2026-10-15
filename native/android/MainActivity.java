package ru.dagstudio.player;

import android.os.Bundle;
import android.view.KeyEvent;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(DAGCarModePlugin.class);
        super.onCreate(savedInstanceState);
    }
    @Override public boolean onKeyDown(int keyCode, KeyEvent event) {
        // Fallback for TEYES firmware that sends key events to the active
        // Activity instead of the Android MediaSession.
        if (event.getRepeatCount() == 0) {
            switch (keyCode) {
                case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                case KeyEvent.KEYCODE_HEADSETOOK:
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
