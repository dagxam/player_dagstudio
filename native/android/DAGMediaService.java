package ru.dagstudio.player;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.Context;
import android.content.pm.ServiceInfo;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.view.KeyEvent;

public final class DAGMediaService extends Service {
    public static final String ACTION_UPDATE = "ru.dagstudio.player.MEDIA_UPDATE";
    private static final String ACTION_PLAY = "ru.dagstudio.player.MEDIA_PLAY";
    private static final String ACTION_PAUSE = "ru.dagstudio.player.MEDIA_PAUSE";
    private static final String ACTION_NEXT = "ru.dagstudio.player.MEDIA_NEXT";
    private static final String ACTION_PREVIOUS = "ru.dagstudio.player.MEDIA_PREV";
    static final String ACTION_AUDIO_LOAD = "ru.dagstudio.player.AUDIO_LOAD";
    static final String ACTION_AUDIO_RESUME = "ru.dagstudio.player.AUDIO_RESUME";
    static final String ACTION_AUDIO_PAUSE = "ru.dagstudio.player.AUDIO_PAUSE";
    static final String ACTION_AUDIO_SEEK = "ru.dagstudio.player.AUDIO_SEEK";
    static final String ACTION_AUDIO_STOP = "ru.dagstudio.player.AUDIO_STOP";
    static final String ACTION_AUDIO_EQ = "ru.dagstudio.player.AUDIO_EQ";
    private static final String CHANNEL_ID = "dagstudio_media_player";
    private static final int NOTIFICATION_ID = 2026;

    private MediaSession session;
    private DAGAudioEngine audioEngine;
    private PowerManager.WakeLock wakeLock;
    private boolean playing = false;
    private String title = "DAGSTUDIO PLAYER";
    private String artist = "";

    @Override public void onCreate() {
        super.onCreate();
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID,
                "Воспроизведение DAGSTUDIO", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Управление музыкой на автомагнитоле");
            nm.createNotificationChannel(channel);
        }
        session = new MediaSession(this, "DAGSTUDIO_PLAYER");
        session.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { forward("play"); }
            @Override public void onPause() { forward("pause"); }
            @Override public void onSkipToNext() { forward("next"); }
            @Override public void onSkipToPrevious() { forward("previous"); }
            @Override public void onStop() { forward("pause"); }
            @Override public boolean onMediaButtonEvent(Intent buttonIntent) {
                if (!Intent.ACTION_MEDIA_BUTTON.equals(buttonIntent.getAction())) {
                    return super.onMediaButtonEvent(buttonIntent);
                }
                KeyEvent event = buttonIntent.getParcelableExtra(Intent.EXTRA_KEY_EVENT);
                if (event == null || event.getAction() != KeyEvent.ACTION_DOWN ||
                    event.getRepeatCount() > 0) return true;
                switch (event.getKeyCode()) {
                    case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                    case KeyEvent.KEYCODE_HEADSETHOOK: forward("toggle"); return true;
                    case KeyEvent.KEYCODE_MEDIA_PLAY: forward("play"); return true;
                    case KeyEvent.KEYCODE_MEDIA_PAUSE:
                    case KeyEvent.KEYCODE_MEDIA_STOP: forward("pause"); return true;
                    case KeyEvent.KEYCODE_MEDIA_NEXT: forward("next"); return true;
                    case KeyEvent.KEYCODE_MEDIA_PREVIOUS: forward("previous"); return true;
                    default: return super.onMediaButtonEvent(buttonIntent);
                }
            }
        });
        session.setActive(true);
        audioEngine = new DAGAudioEngine(this, this::refreshEngineState);
    }

    private void refreshEngineState() {
        if (audioEngine == null || session == null) return;
        playing = audioEngine.isPlayingOrLoading();
        long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE |
            PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SKIP_TO_NEXT |
            PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_SEEK_TO;
        session.setPlaybackState(new PlaybackState.Builder()
            .setActions(actions)
            .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                PlaybackState.PLAYBACK_POSITION_UNKNOWN, playing ? 1f : 0f).build());
        if (playing) {
            if (android.os.Build.VERSION.SDK_INT >= 29)
                startForeground(NOTIFICATION_ID, notification(),
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            else startForeground(NOTIFICATION_ID, notification());
            setCpuWakeLock(true);
        } else {
            setCpuWakeLock(false);
            stopForeground(true);
            NotificationManager nm = (NotificationManager)getSystemService(Context.NOTIFICATION_SERVICE);
            nm.notify(NOTIFICATION_ID, notification());
        }
    }

    private static void forward(String command) {
        DAGCarModePlugin.notifyMediaCommand(command);
    }

    private PendingIntent commandIntent(String action, int requestCode) {
        Intent intent = new Intent(this, DAGMediaService.class);
        intent.setAction(action);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getService(this, requestCode, intent, flags);
    }

    private Notification notification() {
        Intent open = new Intent(this, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPending = PendingIntent.getActivity(this, 40, open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_ID) : new Notification.Builder(this);
        return b.setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(title)
            .setContentText(artist.isEmpty() ? "DAGSTUDIO PLAYER" : artist)
            .setContentIntent(openPending)
            .setOngoing(playing)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_previous,
                "Предыдущая", commandIntent(ACTION_PREVIOUS, 41)).build())
            .addAction(new Notification.Action.Builder(playing ? android.R.drawable.ic_media_pause :
                android.R.drawable.ic_media_play, playing ? "Пауза" : "Играть",
                commandIntent(playing ? ACTION_PAUSE : ACTION_PLAY, 42)).build())
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_next,
                "Следующая", commandIntent(ACTION_NEXT, 43)).build())
            .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2))
            .build();
    }

    private void setCpuWakeLock(boolean enabled) {
        if (enabled) {
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "DAGSTUDIO:Music");
                wakeLock.setReferenceCounted(false);
            }
            if (!wakeLock.isHeld()) wakeLock.acquire();
        } else if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        final String action = intent.getAction();
        if (ACTION_AUDIO_LOAD.equals(action)) {
            title = intent.getStringExtra("title");
            artist = intent.getStringExtra("artist");
            if (title == null || title.isEmpty()) title = "DAGSTUDIO PLAYER";
            if (artist == null) artist = "";
            session.setMetadata(new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, artist).build());
            // startForegroundService must promote within 5 seconds, including during buffering.
            playing = true;
            if (Build.VERSION.SDK_INT >= 29)
                startForeground(NOTIFICATION_ID, notification(),
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            else startForeground(NOTIFICATION_ID, notification());
            String url = intent.getStringExtra("url");
            if (url != null && !url.isEmpty()) audioEngine.load(
                url, intent.getStringExtra("cacheKey"),
                intent.getLongExtra("positionMs", 0L));
            return START_STICKY;
        }
        if (ACTION_AUDIO_RESUME.equals(action)) {
            playing = true;
            if (Build.VERSION.SDK_INT >= 29)
                startForeground(NOTIFICATION_ID, notification(),
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            else startForeground(NOTIFICATION_ID, notification());
            audioEngine.play();
            return START_STICKY;
        }
        if (ACTION_AUDIO_PAUSE.equals(action)) {
            audioEngine.pause();
            return START_STICKY;
        }
        if (ACTION_AUDIO_STOP.equals(action)) {
            audioEngine.stop();
            return START_NOT_STICKY;
        }
        if (ACTION_AUDIO_SEEK.equals(action)) {
            audioEngine.seek(intent.getLongExtra("positionMs", 0L));
            return START_STICKY;
        }
        if (ACTION_AUDIO_EQ.equals(action)) {
            audioEngine.setEqualizer(intent.getBooleanExtra("enabled", false),
                intent.getStringExtra("gains"));
            return START_STICKY;
        }
        if (ACTION_PLAY.equals(action) || ACTION_PAUSE.equals(action) ||
            ACTION_NEXT.equals(action) || ACTION_PREVIOUS.equals(action)) {
            forward(ACTION_PLAY.equals(action) ? "play" : ACTION_PAUSE.equals(action) ? "pause" :
                ACTION_NEXT.equals(action) ? "next" : "previous");
            return START_NOT_STICKY;
        }
        if (ACTION_UPDATE.equals(action)) {
            playing = intent.getBooleanExtra("playing", false);
            title = intent.getStringExtra("title");
            artist = intent.getStringExtra("artist");
            if (title == null || title.isEmpty()) title = "DAGSTUDIO PLAYER";
            if (artist == null) artist = "";
            session.setMetadata(new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, artist).build());
            long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE |
                PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SKIP_TO_NEXT |
                PlaybackState.ACTION_SKIP_TO_PREVIOUS;
            session.setPlaybackState(new PlaybackState.Builder()
                .setActions(actions)
                .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                    PlaybackState.PLAYBACK_POSITION_UNKNOWN, playing ? 1f : 0f).build());
            if (playing) {
                Notification n = notification();
                if (Build.VERSION.SDK_INT >= 29) {
                    startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
                } else {
                    startForeground(NOTIFICATION_ID, n);
                }
                setCpuWakeLock(true);
            } else {
                // Keep paused MediaSession registered so the steering-wheel Play
                // button can resume it. Release the CPU lock and foreground mode.
                setCpuWakeLock(false);
                stopForeground(true);
                NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                nm.notify(NOTIFICATION_ID, notification());
            }
        }
        return START_NOT_STICKY;
    }

    @Override public IBinder onBind(Intent intent) { return null; }
    @Override public void onDestroy() {
        setCpuWakeLock(false);
        if (audioEngine != null) { audioEngine.release(); audioEngine = null; }
        if (session != null) { session.setActive(false); session.release(); session = null; }
        super.onDestroy();
    }
}
