package com.royaltaxi.tunnel;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;
import android.util.Log;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.InetSocketAddress;
import java.net.Socket;

public class TunnelService extends Service {

    private static final String TAG = "RoyaltaxiTunnel";
    private static final String CHANNEL_ID = "royaltaxi_tunnel";
    private static final int NOTIFICATION_ID = 1001;

    // Server konfiguratsiyasi — to'g'ridan-to'g'ri APK'ga yozilgan
    private static final String SERVER_URL = "http://46.8.194.45:8080";
    private static final String AUTH = "tunnel:Jvr2iOpDaV";

    private volatile boolean running = false;
    private Thread workerThread;
    private Thread watchdogThread;
    private Process chiselProc;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private ConnectivityManager.NetworkCallback networkCallback;
    private BroadcastReceiver screenReceiver;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!running) {
            createNotificationChannel();
            startForeground(NOTIFICATION_ID, buildNotification("Ishga tushdi", "Tunel ulanmoqda..."));
            acquireLocks();
            registerNetworkCallback();
            registerScreenReceiver();
            scheduleAlarmKick();  // Har 2 daqiqada doze-mode'dan uyg'otish
            running = true;
            workerThread = new Thread(this::runLoop, "tunnel-worker");
            workerThread.setDaemon(true);
            workerThread.start();
            watchdogThread = new Thread(this::watchdogLoop, "tunnel-watchdog");
            watchdogThread.setDaemon(true);
            watchdogThread.start();
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        if (chiselProc != null) {
            chiselProc.destroy();
        }
        releaseLocks();
        unregisterNetworkCallback();
        unregisterScreenReceiver();

        // Xizmatni qayta tiklash — tizim o'ldirsa darhol tirilsin
        Intent restart = new Intent(getApplicationContext(), TunnelService.class);
        PendingIntent pi = PendingIntent.getService(getApplicationContext(), 0, restart,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        try {
            pi.send();
        } catch (Exception ignored) {
        }
        super.onDestroy();
    }

    // ─── WATCHDOG: har 30 sek da tunelni tekshiradi va o'ldirib qayta tiklatadi ───
    private void watchdogLoop() {
        while (running) {
            try {
                Thread.sleep(30000);
                if (!running) break;
                // Chisel jarayoni o'lganmi?
                if (chiselProc == null || !chiselProc.isAlive()) {
                    Log.w(TAG, "Watchdog: chisel o'lik, jarayonni qayta tiklash");
                    continue;
                }
                // TCP socket'ni test qilish — server'ga ulanish mavjud bo'lsa, sog'lom
                boolean reachable = canReachServer();
                if (!reachable) {
                    Log.w(TAG, "Watchdog: server'ga ulanish yo'q — chisel'ni qayta tiklash");
                    try {
                        if (chiselProc != null) chiselProc.destroy();
                    } catch (Exception ignored) {}
                    updateNotification("Qayta ulanmoqda", "Ulanish yo'q — qayta sozlanmoqda");
                }
            } catch (InterruptedException e) {
                break;
            } catch (Exception e) {
                Log.w(TAG, "Watchdog xato: " + e.getMessage());
            }
        }
    }

    private boolean canReachServer() {
        Socket s = null;
        try {
            s = new Socket();
            s.connect(new InetSocketAddress("46.8.194.45", 8080), 5000);
            return true;
        } catch (Exception e) {
            return false;
        } finally {
            if (s != null) try { s.close(); } catch (Exception ignored) {}
        }
    }

    // ─── NETWORK CALLBACK: WiFi o'zgarsa darhol qayta ulash ───
    private void registerNetworkCallback() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return;
            NetworkRequest req = new NetworkRequest.Builder()
                    .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    .build();
            networkCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    Log.i(TAG, "Network mavjud: " + network);
                    // Chisel'ni qayta ulanish uchun majburlash
                    if (chiselProc != null) {
                        try { chiselProc.destroy(); } catch (Exception ignored) {}
                    }
                }

                @Override
                public void onLost(Network network) {
                    Log.w(TAG, "Network yo'qoldi: " + network);
                    updateNotification("Internet kutilmoqda", "WiFi/mobil tarmoqni tekshiring");
                }
            };
            cm.registerNetworkCallback(req, networkCallback);
        } catch (Exception e) {
            Log.w(TAG, "Network callback xato: " + e.getMessage());
        }
    }

    private void unregisterNetworkCallback() {
        try {
            if (networkCallback != null) {
                ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
                if (cm != null) cm.unregisterNetworkCallback(networkCallback);
                networkCallback = null;
            }
        } catch (Exception ignored) {}
    }

    // ─── SCREEN RECEIVER: ekran yoqilganda darhol tekshirish ───
    private void registerScreenReceiver() {
        try {
            IntentFilter filter = new IntentFilter();
            filter.addAction(Intent.ACTION_SCREEN_ON);
            filter.addAction(Intent.ACTION_USER_PRESENT);
            screenReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    Log.i(TAG, "Screen event: " + intent.getAction() + " — health check");
                    // Backgroundda darhol tekshir
                    new Thread(() -> {
                        if (!canReachServer() && chiselProc != null) {
                            try { chiselProc.destroy(); } catch (Exception ignored) {}
                        }
                    }, "screen-check").start();
                }
            };
            registerReceiver(screenReceiver, filter);
        } catch (Exception ignored) {}
    }

    private void unregisterScreenReceiver() {
        try {
            if (screenReceiver != null) {
                unregisterReceiver(screenReceiver);
                screenReceiver = null;
            }
        } catch (Exception ignored) {}
    }

    // ─── ALARM KICK: Doze mode bo'lsa ham 2 daqiqada uyg'otadi ───
    private void scheduleAlarmKick() {
        try {
            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Intent intent = new Intent(this, TunnelService.class);
            PendingIntent pi = PendingIntent.getService(this, 99, intent,
                    PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            long triggerAt = SystemClock.elapsedRealtime() + 120000;
            if (Build.VERSION.SDK_INT >= 23) {
                am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi);
            } else {
                am.setExact(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi);
            }
        } catch (Exception e) {
            Log.w(TAG, "Alarm kick xato: " + e.getMessage());
        }
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // App swipe qilingan — service davom etsin
        Intent restart = new Intent(getApplicationContext(), TunnelService.class);
        if (Build.VERSION.SDK_INT >= 26) {
            startForegroundService(restart);
        } else {
            startService(restart);
        }
        super.onTaskRemoved(rootIntent);
    }

    private void acquireLocks() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Royaltaxi:Tunnel");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire();

            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "Royaltaxi:WiFi");
            wifiLock.setReferenceCounted(false);
            wifiLock.acquire();
        } catch (Exception e) {
            Log.w(TAG, "Lock olishda xato: " + e.getMessage());
        }
    }

    private void releaseLocks() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
            if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
        } catch (Exception ignored) {
        }
    }

    private void runLoop() {
        // jniLibs ichidagi chisel binary'ni topamiz
        String chiselPath = getApplicationInfo().nativeLibraryDir + "/libchisel.so";
        File chiselFile = new File(chiselPath);
        if (!chiselFile.exists()) {
            Log.e(TAG, "chisel binary topilmadi: " + chiselPath);
            updateNotification("Xato", "chisel binary topilmadi");
            return;
        }

        int reconnects = 0;
        while (running) {
            try {
                Log.i(TAG, "chisel ishga tushmoqda (urinish #" + reconnects + ")");
                updateNotification("Ulangan", "Tunel ishlamoqda — yopmang");

                ProcessBuilder pb = new ProcessBuilder(
                        chiselPath,
                        "client",
                        "--auth", AUTH,
                        "--keepalive", "15s",
                        "--max-retry-interval", "3s",
                        "--max-retry-count", "-1",
                        SERVER_URL,
                        // Telefon port 1081'ga binding — PC'ning 1080 bilan konflikt qilmasligi uchun
                        // (PC va telefon parallel ishlasin, dashboard tanlash imkoni beradi)
                        "R:1081:socks"
                );
                pb.redirectErrorStream(true);
                chiselProc = pb.start();

                // Log o'qish (asynchronous emas, sodda)
                BufferedReader br = new BufferedReader(new InputStreamReader(chiselProc.getInputStream()));
                String line;
                while ((line = br.readLine()) != null && running) {
                    Log.d(TAG, line);
                }

                int code = chiselProc.waitFor();
                Log.w(TAG, "chisel exit code: " + code);
            } catch (IOException | InterruptedException e) {
                Log.e(TAG, "chisel xatosi: " + e.getMessage());
            }

            if (!running) break;
            reconnects++;
            updateNotification("Qayta ulanmoqda", "Internet/WiFi tekshiring (urinish #" + reconnects + ")");
            try {
                Thread.sleep(3000);
            } catch (InterruptedException ignored) {
                break;
            }
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID,
                    "Royaltaxi Tunel",
                    NotificationManager.IMPORTANCE_LOW
            );
            ch.setDescription("Tunel doimiy bildirishnomasi");
            ch.setShowBadge(false);
            ch.setSound(null, null);
            NotificationManager nm = getSystemService(NotificationManager.class);
            nm.createNotificationChannel(ch);
        }
    }

    private Notification buildNotification(String title, String content) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(this, 0, intent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            b = new Notification.Builder(this, CHANNEL_ID);
        } else {
            b = new Notification.Builder(this);
        }
        return b.setContentTitle("🚖 " + title)
                .setContentText(content)
                .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(pi)
                .build();
    }

    private void updateNotification(String title, String content) {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            nm.notify(NOTIFICATION_ID, buildNotification(title, content));
        } catch (Exception ignored) {
        }
    }
}
