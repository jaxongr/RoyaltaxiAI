package com.royaltaxi.tunnel;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        // Telefon yongan zahoti yoki APK yangilangandan keyin —
        // xizmatni darhol ishga tushiramiz
        Intent service = new Intent(context, TunnelService.class);
        if (Build.VERSION.SDK_INT >= 26) {
            context.startForegroundService(service);
        } else {
            context.startService(service);
        }
    }
}
