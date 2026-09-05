package com.vovkat34.chat;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class MyFirebaseMessagingService extends FirebaseMessagingService {
    // v3 is intentional: Android notification-channel sound/importance cannot
    // be changed after a channel has already been created. A new channel ID
    // guarantees that an updated APK gets a fresh sound-enabled channel.
    private static final String CHANNEL_ID = "chat_messages_v3";

    @Override
    public void onNewToken(@NonNull String token) {
        getSharedPreferences("chat_android", MODE_PRIVATE)
                .edit()
                .putString("fcm_token", token)
                .apply();
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        RemoteMessage.Notification notification = message.getNotification();
        String title = notification != null
                ? notification.getTitle()
                : message.getData().get("title");
        String body = notification != null
                ? notification.getBody()
                : message.getData().get("body");

        if (title == null || title.trim().isEmpty()) title = "Новое сообщение";
        if (body == null) body = "";

        showNotification(title, body);
    }

    private void ensureNotificationChannel(NotificationManager manager) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Сообщения",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Уведомления о новых сообщениях и звонках");
        channel.enableLights(true);
        channel.setLightColor(Color.WHITE);

        AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();

        channel.setSound(
                Settings.System.DEFAULT_NOTIFICATION_URI,
                audioAttributes
        );

        manager.createNotificationChannel(channel);
    }

    private void showNotification(String title, String body) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;

        ensureNotificationChannel(manager);

        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(
                Intent.FLAG_ACTIVITY_CLEAR_TOP |
                Intent.FLAG_ACTIVITY_SINGLE_TOP
        );

        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT |
                (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                        ? PendingIntent.FLAG_IMMUTABLE
                        : 0)
        );

        Notification notification;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            notification = new Notification.Builder(this, CHANNEL_ID)
                    .setSmallIcon(R.drawable.ic_launcher)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setStyle(new Notification.BigTextStyle().bigText(body))
                    .setContentIntent(pendingIntent)
                    .setAutoCancel(true)
                    .setPriority(Notification.PRIORITY_HIGH)
                    .build();
        } else {
            notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                    .setSmallIcon(R.drawable.ic_launcher)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setContentIntent(pendingIntent)
                    .setAutoCancel(true)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setSound(Settings.System.DEFAULT_NOTIFICATION_URI)
                    .build();
        }

        int notificationId = (int) (System.currentTimeMillis() & 0x7fffffff);
        manager.notify(notificationId, notification);
    }
}
