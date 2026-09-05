package com.vovkat34.chat;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;

public class MainActivity extends Activity {
    private static final String START_URL = "https://vovkat-34.github.io/chat/";
    private static final int MEDIA_PERMISSION_REQUEST = 4101;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 4102;
    private static final String NOTIFICATION_CHANNEL_ID = "chat_messages";

    private WebView webView;
    private PermissionRequest pendingWebPermission;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannel();
        setupWebView();
        // Do not reuse a stale WebView HTTP cache after a GitHub Pages deploy.
        // DOM/localStorage (including the Supabase session) are not cleared.
        webView.clearCache(false);
        webView.loadUrl(START_URL);
    }

    private void setupWebView() {
        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        if (WebViewFeature.isFeatureSupported(WebViewFeature.FORCE_DARK)) {
            WebSettingsCompat.setForceDark(settings, WebSettingsCompat.FORCE_DARK_OFF);
        }

        webView.addJavascriptInterface(new NotificationBridge(), "AndroidNotifications");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return false;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> handleWebPermission(request));
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingWebPermission == request) {
                    pendingWebPermission = null;
                }
            }
        });
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager == null) return;

            NotificationChannel channel = new NotificationChannel(
                    NOTIFICATION_CHANNEL_ID,
                    "Сообщения",
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Уведомления о новых сообщениях и звонках");
            manager.createNotificationChannel(channel);
        }
    }

    private boolean areNotificationsEnabled() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            return false;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            return manager != null && manager.areNotificationsEnabled();
        }

        return true;
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(
                        this,
                        new String[]{Manifest.permission.POST_NOTIFICATIONS},
                        NOTIFICATION_PERMISSION_REQUEST
                );
                return;
            }
        }

        if (!areNotificationsEnabled()) {
            openNotificationSettings();
        }
    }

    private void openNotificationSettings() {
        try {
            Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
            startActivity(intent);
        } catch (Exception ignored) {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getPackageName()));
            startActivity(intent);
        }
    }

    private void handleWebPermission(PermissionRequest request) {
        Uri origin = request.getOrigin();
        if (origin == null || !"https".equalsIgnoreCase(origin.getScheme())
                || !"vovkat-34.github.io".equalsIgnoreCase(origin.getHost())) {
            request.deny();
            return;
        }

        boolean wantsAudio = false;
        boolean wantsVideo = false;
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) wantsAudio = true;
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) wantsVideo = true;
        }

        boolean audioGranted = !wantsAudio
                || ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
        boolean videoGranted = !wantsVideo
                || ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                == PackageManager.PERMISSION_GRANTED;

        if (audioGranted && videoGranted) {
            grantRequestedMediaResources(request);
            return;
        }

        pendingWebPermission = request;
        if (wantsAudio && wantsVideo) {
            ActivityCompat.requestPermissions(this,
                    new String[]{Manifest.permission.RECORD_AUDIO, Manifest.permission.CAMERA},
                    MEDIA_PERMISSION_REQUEST);
        } else if (wantsAudio) {
            ActivityCompat.requestPermissions(this,
                    new String[]{Manifest.permission.RECORD_AUDIO},
                    MEDIA_PERMISSION_REQUEST);
        } else if (wantsVideo) {
            ActivityCompat.requestPermissions(this,
                    new String[]{Manifest.permission.CAMERA},
                    MEDIA_PERMISSION_REQUEST);
        } else {
            request.deny();
            pendingWebPermission = null;
        }
    }

    private void grantRequestedMediaResources(PermissionRequest request) {
        String[] requested = request.getResources();
        java.util.ArrayList<String> allowed = new java.util.ArrayList<>();

        for (String resource : requested) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)
                    && ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                    == PackageManager.PERMISSION_GRANTED) {
                allowed.add(resource);
            }
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)
                    && ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                    == PackageManager.PERMISSION_GRANTED) {
                allowed.add(resource);
            }
        }

        if (allowed.size() == requested.length) {
            request.grant(allowed.toArray(new String[0]));
        } else {
            request.deny();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == MEDIA_PERMISSION_REQUEST) {
            if (pendingWebPermission == null) return;
            PermissionRequest request = pendingWebPermission;
            pendingWebPermission = null;
            grantRequestedMediaResources(request);
            return;
        }

        if (requestCode == NOTIFICATION_PERMISSION_REQUEST) {
            if (!areNotificationsEnabled()) {
                // The user can always change the decision later in Android's
                // notification settings. Do not repeatedly prompt here.
            }
        }
    }

    private class NotificationBridge {
        @JavascriptInterface
        public boolean isEnabled() {
            return areNotificationsEnabled();
        }

        @JavascriptInterface
        public void requestPermission() {
            runOnUiThread(() -> requestNotificationPermission());
        }

        @JavascriptInterface
        public void openSettings() {
            runOnUiThread(() -> openNotificationSettings());
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
            // Tell the web app that Android has resumed the WebView so its
            // Supabase Realtime channels can be rejoined immediately.
            webView.post(() -> webView.evaluateJavascript(
                    "window.dispatchEvent(new Event('androidresume'));",
                    null
            ));
        }
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            webView.onPause();
        }
        super.onPause();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.removeJavascriptInterface("AndroidNotifications");
            webView.destroy();
        }
        super.onDestroy();
    }
}
