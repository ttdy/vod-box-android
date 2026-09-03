package com.vodbox.app;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.res.AssetManager;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Looper;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends Activity {

    private static final String NODE_URL = "http://127.0.0.1:3000/";

    static {
        System.loadLibrary("native-lib");
        System.loadLibrary("node");
    }

    public static boolean _startedNodeAlready = false;

    private WebView webView;
    private FrameLayout loadingView;

    public native Integer startNodeWithArguments(String[] arguments);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);

        webView = new WebView(this);
        loadingView = new FrameLayout(this);
        loadingView.setBackgroundColor(Color.WHITE);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.gravity = android.view.Gravity.CENTER;
        ProgressBar pb = new ProgressBar(this);
        TextView tv = new TextView(this);
        tv.setText("正在启动服务…");
        tv.setTextColor(Color.GRAY);
        tv.setPadding(0, 24, 0, 0);
        box.addView(pb);
        box.addView(tv);
        loadingView.addView(box, lp);

        root.addView(loadingView, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(webView, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        setContentView(root);
        webView.setVisibility(android.view.View.GONE);

        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setAllowFileAccess(false);
        ws.setMediaPlaybackRequiresUserGesture(false);
        if (android.os.Build.VERSION.SDK_INT >= 21) {
            ws.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String u = request.getUrl().toString();
                if (u.startsWith(NODE_URL)) {
                    return false;
                }
                try {
                    android.content.Intent i = new android.content.Intent(
                            android.content.Intent.ACTION_VIEW, android.net.Uri.parse(u));
                    startActivity(i);
                } catch (Exception ignored) {}
                return true;
            }
        });

        if (!_startedNodeAlready) {
            _startedNodeAlready = true;
            startNodeThread();
        }
        waitForServerThenLoad();
    }

    private void startNodeThread() {
        new Thread(new Runnable() {
            @Override
            public void run() {
                final String nodeDir = getApplicationContext().getFilesDir().getAbsolutePath()
                        + "/nodejs-project";
                if (wasAPKUpdated()) {
                    File nodeDirReference = new File(nodeDir);
                    if (nodeDirReference.exists()) {
                        deleteFolderRecursively(nodeDirReference);
                    }
                    copyAssetFolder(getApplicationContext().getAssets(), "nodejs-project", nodeDir);
                    saveLastUpdateTime();
                }
                startNodeWithArguments(new String[]{"node", nodeDir + "/server.js"});
            }
        }).start();
    }

    private void waitForServerThenLoad() {
        new Thread(new Runnable() {
            @Override
            public void run() {
                int tries = 0;
                while (!isServerUp() && tries < 80) {
                    try { Thread.sleep(300); } catch (InterruptedException e) { break; }
                    tries++;
                }
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        loadingView.setVisibility(android.view.View.GONE);
                        webView.setVisibility(android.view.View.VISIBLE);
                        webView.loadUrl(NODE_URL);
                    }
                });
            }
        }).start();
    }

    private boolean isServerUp() {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(NODE_URL + "api/sources").openConnection();
            c.setConnectTimeout(300);
            c.setReadTimeout(300);
            int code = c.getResponseCode();
            c.disconnect();
            return code >= 200 && code < 500;
        } catch (Exception e) {
            return false;
        }
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
        if (webView != null) webView.destroy();
        super.onDestroy();
    }

    private boolean wasAPKUpdated() {
        SharedPreferences prefs = getApplicationContext().getSharedPreferences("NODEJS_MOBILE_PREFS", Context.MODE_PRIVATE);
        long previousLastUpdateTime = prefs.getLong("NODEJS_MOBILE_APK_LastUpdateTime", 0);
        long lastUpdateTime = getApkUpdateTime();
        return lastUpdateTime != previousLastUpdateTime;
    }

    private void saveLastUpdateTime() {
        SharedPreferences prefs = getApplicationContext().getSharedPreferences("NODEJS_MOBILE_PREFS", Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        editor.putLong("NODEJS_MOBILE_APK_LastUpdateTime", getApkUpdateTime());
        editor.commit();
    }

    private long getApkUpdateTime() {
        long t = 1;
        try {
            PackageInfo packageInfo = getApplicationContext().getPackageManager()
                    .getPackageInfo(getApplicationContext().getPackageName(), 0);
            t = packageInfo.lastUpdateTime;
        } catch (PackageManager.NameNotFoundException e) {
            e.printStackTrace();
        }
        return t;
    }

    private static boolean deleteFolderRecursively(File file) {
        try {
            boolean res = true;
            File[] children = file.listFiles();
            if (children != null) {
                for (File childFile : children) {
                    if (childFile.isDirectory()) {
                        res &= deleteFolderRecursively(childFile);
                    } else {
                        res &= childFile.delete();
                    }
                }
            }
            res &= file.delete();
            return res;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    private static boolean copyAssetFolder(AssetManager assetManager, String fromAssetPath, String toPath) {
        try {
            String[] files = assetManager.list(fromAssetPath);
            if (files == null) return false;
            if (files.length == 0) {
                return copyAsset(assetManager, fromAssetPath, toPath);
            } else {
                new File(toPath).mkdirs();
                boolean res = true;
                for (String file : files) {
                    res &= copyAssetFolder(assetManager, fromAssetPath + "/" + file, toPath + "/" + file);
                }
                return res;
            }
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        }
    }

    private static boolean copyAsset(AssetManager assetManager, String fromAssetPath, String toPath) {
        InputStream in = null;
        OutputStream out = null;
        try {
            in = assetManager.open(fromAssetPath);
            new File(toPath).createNewFile();
            out = new FileOutputStream(toPath);
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
            in.close();
            in = null;
            out.flush();
            out.close();
            out = null;
            return true;
        } catch (Exception e) {
            e.printStackTrace();
            return false;
        } finally {
            if (in != null) { try { in.close(); } catch (IOException ignored) {} }
            if (out != null) { try { out.close(); } catch (IOException ignored) {} }
        }
    }
}
