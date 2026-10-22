package nz.pond.game;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import androidx.webkit.WebViewAssetLoader;
import java.io.ByteArrayInputStream;
import java.io.OutputStream;

/** Offline host: only packaged content is loaded inside the WebView. */
public class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net";
    private static final String START = ORIGIN + "/index.html";
    private static final int PHOTO_REQUEST = 41;
    private WebView web;
    private byte[] pendingPhoto;
    private boolean foreground;

    private boolean local(Uri uri) {
        return "https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost())
            && (uri.getPort() == -1 || uri.getPort() == 443);
    }

    @SuppressLint("SetJavaScriptEnabled") // Only trusted bundled scripts; remote navigation and subresources blocked.
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(14, 58, 70));
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                v.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            } else {
                v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(14, 58, 70));
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        web.addJavascriptInterface(new PhotoBridge(), "PondAndroid");
        WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
            .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (local(uri) && "/".equals(uri.getPath())) uri = Uri.parse(START);
                WebResourceResponse response = local(uri) ? assets.shouldInterceptRequest(uri) : null;
                // Never fall through to a network fetch, including missing local files.
                return response != null ? response : new WebResourceResponse("text/plain", "UTF-8", 404, "Not found", java.util.Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (local(uri)) return false;
                if (request.isForMainFrame() && request.hasGesture() && "https".equals(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                    catch (android.content.ActivityNotFoundException ignored) { message("No browser is available."); }
                }
                return true;
            }
            @Override public void onPageFinished(WebView view, String url) {
                view.evaluateJavascript("window.PondPlatform?.setHostPaused?.(" + !foreground + ")", null);
            }
        });
        web.setWebChromeClient(new WebChromeClient());
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        root.requestApplyInsets();
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
            android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        web.loadUrl(START);
    }

    private void handleBack() {
        if (web.canGoBack()) { web.goBack(); return; }
        web.evaluateJavascript("window.pondAndroidBack?.() || false", handled -> {
            if ("true".equals(handled)) return;
            new AlertDialog.Builder(this).setMessage("Save and leave Pond?")
                .setNegativeButton("Keep playing", null)
                .setPositiveButton("Save and leave", (dialog, which) ->
                    web.evaluateJavascript("window.pondAndroidSave?.()", unused -> finish())).show();
        });
    }
    @SuppressWarnings("deprecation")
    @SuppressLint("GestureBackNavigation") // Legacy API 26–32 path; API 33+ registers OnBackInvokedCallback above.
    @Override public void onBackPressed() { handleBack(); }

    @Override protected void onPause() {
        foreground = false;
        // Save and mute before suspending the WebView; preserve the user's pause setting.
        web.evaluateJavascript("window.pondAndroidSave?.();window.PondPlatform?.setHostPaused?.(true)", unused -> {
            if (!foreground && web != null) web.onPause();
        });
        super.onPause();
    }
    @Override protected void onResume() {
        super.onResume(); foreground = true;
        if (web != null) { web.onResume(); web.evaluateJavascript("window.PondPlatform?.setHostPaused?.(false)", null); }
    }
    @Override protected void onDestroy() {
        if (web != null) { ((android.view.ViewGroup) web.getParent()).removeView(web); web.destroy(); web = null; }
        pendingPhoto = null;
        super.onDestroy();
    }

    private void message(String text) { Toast.makeText(this, text, Toast.LENGTH_LONG).show(); }
    private final class PhotoBridge {
        @JavascriptInterface public void savePhoto(String encoded) {
            // Fixed PNG output, bounded memory, and a user-chosen destination; no arbitrary filesystem access.
            if (encoded == null || encoded.length() > 32 * 1024 * 1024) {
                runOnUiThread(() -> message("This pond photo is too large to export.")); return;
            }
            final byte[] bytes;
            try { bytes = Base64.decode(encoded, Base64.DEFAULT); }
            catch (IllegalArgumentException error) { return; }
            if (bytes.length < 8 || bytes[0] != (byte)137 || bytes[1] != 80 || bytes[2] != 78 || bytes[3] != 71) return;
            runOnUiThread(() -> {
                if (pendingPhoto != null || isFinishing()) return;
                pendingPhoto = bytes;
                Intent choose = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("image/png").putExtra(Intent.EXTRA_TITLE, "pond-photo.png");
                try { startActivityForResult(choose, PHOTO_REQUEST); }
                catch (android.content.ActivityNotFoundException error) { pendingPhoto = null; message("No file picker is available."); }
            });
        }
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != PHOTO_REQUEST) return;
        byte[] photo = pendingPhoto; pendingPhoto = null;
        if (result != RESULT_OK || data == null || data.getData() == null || photo == null) return;
        Uri destination = data.getData();
        new Thread(() -> {
            try (OutputStream out = getContentResolver().openOutputStream(destination)) {
                if (out == null) throw new java.io.IOException("No output stream");
                out.write(photo);
                runOnUiThread(() -> message("Pond photo saved."));
            } catch (java.io.IOException error) { runOnUiThread(() -> message("Could not save the photo. Try another location.")); }
        }, "pond-photo").start();
    }
}
