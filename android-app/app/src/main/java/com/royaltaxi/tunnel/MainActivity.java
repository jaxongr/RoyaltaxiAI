package com.royaltaxi.tunnel;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // POST_NOTIFICATIONS uchun ruxsat (Android 13+)
        if (Build.VERSION.SDK_INT >= 33) {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1);
            }
        }

        // Oddiy UI — chiroyli card-like fon, status va tugma
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(Color.parseColor("#6B46C1"));
        root.setPadding(48, 48, 48, 48);

        TextView title = new TextView(this);
        title.setText("🚖 Royaltaxi Tunel");
        title.setTextSize(28);
        title.setTextColor(Color.WHITE);
        title.setPadding(0, 0, 0, 24);
        title.setGravity(Gravity.CENTER);

        TextView status = new TextView(this);
        status.setText("Ishga tushdi — tunel doim ulanib turadi.\n\nBu oynani yopishingiz mumkin —\nxizmat fonda ishlashda davom etadi.");
        status.setTextSize(16);
        status.setTextColor(Color.parseColor("#E0DAFF"));
        status.setGravity(Gravity.CENTER);
        status.setPadding(0, 0, 0, 32);
        status.setLineSpacing(8, 1f);

        Button batteryBtn = new Button(this);
        batteryBtn.setText("Batareya cheklovini olib tashlash");
        batteryBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                try {
                    Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                } catch (Exception e) {
                    // fallback
                    startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
                }
            }
        });

        Button autoStartBtn = new Button(this);
        autoStartBtn.setText("Auto-start sozlamalarini ochish");
        autoStartBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                // Telefon bo'yicha boshqacha — umumiy app sozlamasi ochiladi
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.parse("package:" + getPackageName()));
                startActivity(intent);
            }
        });

        Button closeBtn = new Button(this);
        closeBtn.setText("Yopish (tunel ishlaydi)");
        closeBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finish();
            }
        });

        root.addView(title);
        root.addView(status);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.setMargins(0, 8, 0, 8);
        batteryBtn.setLayoutParams(lp);
        autoStartBtn.setLayoutParams(lp);
        closeBtn.setLayoutParams(lp);
        root.addView(batteryBtn);
        root.addView(autoStartBtn);
        root.addView(closeBtn);

        setContentView(root);

        // Xizmatni ishga tushiramiz
        Intent serviceIntent = new Intent(this, TunnelService.class);
        if (Build.VERSION.SDK_INT >= 26) {
            startForegroundService(serviceIntent);
        } else {
            startService(serviceIntent);
        }
    }
}
