package com.vovkat34.chat;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Person;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import android.provider.Settings;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import org.json.JSONObject;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class MyFirebaseMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL_ID = "chat_messages_v3";
    private static final String CALL_CHANNEL_ID = "chat_calls_v1";

    @Override
    public void onNewToken(@NonNull String token) {
        getSharedPreferences("chat_android", MODE_PRIVATE)
                .edit()
                .putString("fcm_token", token)
                .apply();
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        if ("incoming_call".equals(message.getData().get("type"))) {
            showIncomingCall(message.getData());
            return;
        }

        RemoteMessage.Notification notification = message.getNotification();
        String title = notification != null ? notification.getTitle() : message.getData().get("title");
        String body = notification != null ? notification.getBody() : message.getData().get("body");
        if (title == null || title.trim().isEmpty()) title = "Новое сообщение";
        if (body == null) body = "";
        showMessageNotification(title, body);
        confirmPushDelivery(message.getData());
    }

    private void ensureCallChannel(NotificationManager manager) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
                CALL_CHANNEL_ID, "Входящие звонки", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Входящие аудио- и видеозвонки");
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[]{0, 300, 150, 300, 150, 500});
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        AudioAttributes audio = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        channel.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE), audio);
        manager.createNotificationChannel(channel);
    }

    private PendingIntent callPendingIntent(String action, String callId, String chatId,
                                             String callerName, String mode, int requestCode) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setAction("com.vovkat34.chat." + action.toUpperCase());
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("callAction", action);
        intent.putExtra("callId", callId);
        intent.putExtra("chatId", chatId);
        intent.putExtra("callerName", callerName);
        intent.putExtra("mode", mode);
        return PendingIntent.getActivity(this, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT |
                (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0));
    }

    private void showIncomingCall(java.util.Map<String, String> data) {
        String callId = data.get("callId");
        if (callId == null || callId.trim().isEmpty()) return;
        String chatId = data.get("chatId");
        String callerName = data.get("callerName");
        if (callerName == null || callerName.trim().isEmpty()) callerName = "Входящий звонок";
        String mode = "video".equals(data.get("mode")) ? "video" : "audio";

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        ensureCallChannel(manager);

        int notificationId = callId.hashCode() & 0x7fffffff;
        PendingIntent answer = callPendingIntent("answer", callId, chatId, callerName, mode, notificationId + 1);
        PendingIntent decline = callPendingIntent("reject", callId, chatId, callerName, mode, notificationId + 2);
        PendingIntent open = callPendingIntent("open", callId, chatId, callerName, mode, notificationId + 3);

        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CALL_CHANNEL_ID)
                : new Notification.Builder(this);
        builder.setSmallIcon(R.drawable.ic_launcher)
                .setContentTitle("video".equals(mode) ? "Входящий видеозвонок" : "Входящий звонок")
                .setContentText(callerName)
                .setCategory(Notification.CATEGORY_CALL)
                .setPriority(Notification.PRIORITY_MAX)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(true)
                .setContentIntent(open)
                .setFullScreenIntent(open, true);

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            builder.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE))
                    .setVibrate(new long[]{0, 300, 150, 300, 150, 500});
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Person person = new Person.Builder().setName(callerName).build();
            builder.setStyle(Notification.CallStyle.forIncomingCall(person, decline, answer));
        } else {
            builder.addAction(new Notification.Action.Builder(R.drawable.ic_launcher, "Отклонить", decline).build());
            builder.addAction(new Notification.Action.Builder(R.drawable.ic_launcher, "Принять", answer).build());
        }

        manager.notify(notificationId, builder.build());
    }

    private void confirmPushDelivery(java.util.Map<String, String> data) {
        String messageId = data.get("messageId");
        String userId = data.get("userId");
        String exp = data.get("exp");
        String deliveryToken = data.get("deliveryToken");
        if (messageId == null || userId == null || exp == null ||
                deliveryToken == null || deliveryToken.isEmpty()) return;
        try {
            Long.parseLong(messageId);
            Long.parseLong(exp);
        } catch (NumberFormatException error) {
            return;
        }

        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = new URL("https://sxkukrqjtgkxmzuzondm.supabase.co/functions/v1/confirm-push-delivery");
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(8000);
                connection.setReadTimeout(8000);
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setRequestProperty("x-delivery-token", deliveryToken);
                JSONObject payload = new JSONObject();
                payload.put("messageId", Long.parseLong(messageId));
                payload.put("userId", userId);
                payload.put("exp", Long.parseLong(exp));
                byte[] bytes = payload.toString().getBytes(StandardCharsets.UTF_8);
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(bytes);
                }
                connection.getResponseCode();
            } catch (Exception error) {
                android.util.Log.w("ChatPush", "Не удалось подтвердить доставку push", error);
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
    }

    private void showMessageNotification(String title, String body) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "Сообщения", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Уведомления о новых сообщениях и звонках");
            channel.enableLights(true);
            channel.setLightColor(Color.WHITE);
            AudioAttributes audio = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            channel.setSound(Settings.System.DEFAULT_NOTIFICATION_URI, audio);
            manager.createNotificationChannel(channel);
        }

        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT |
                (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0));

        Notification notification = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                    .setSmallIcon(R.drawable.ic_launcher)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setStyle(new Notification.BigTextStyle().bigText(body))
                    .setContentIntent(pendingIntent)
                    .setAutoCancel(true)
                    .setPriority(Notification.PRIORITY_HIGH)
                    .build()
                : new NotificationCompat.Builder(this, CHANNEL_ID)
                    .setSmallIcon(R.drawable.ic_launcher)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setContentIntent(pendingIntent)
                    .setAutoCancel(true)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setSound(Settings.System.DEFAULT_NOTIFICATION_URI)
                    .build();

        manager.notify((int) (System.currentTimeMillis() & 0x7fffffff), notification);
    }
}
