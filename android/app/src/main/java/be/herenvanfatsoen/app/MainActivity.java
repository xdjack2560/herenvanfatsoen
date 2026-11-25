package be.herenvanfatsoen.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

/**
 * Heren Van Fatsoen: toont herenvanfatsoen.be schermvullend.
 * Alles komt van de site, dus aanpassingen aan de site zijn meteen zichtbaar in de app.
 */
public class MainActivity extends Activity {
    private static final String START_URL = "https://herenvanfatsoen.be/";
    private static final int FILE_REQUEST = 42;

    private WebView web;
    private SwipeRefreshLayout refresh;
    private FrameLayout root;
    private ValueCallback<Uri[]> fileCallback;
    private View customView;
    private WebChromeClient.CustomViewCallback customViewCallback;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        root = new FrameLayout(this);
        refresh = new SwipeRefreshLayout(this);
        refresh.setColorSchemeColors(Color.parseColor("#C51F2A"));
        web = new WebView(this);
        refresh.addView(web, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(refresh, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setAllowFileAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " HVFApp/1.0");
        CookieManager.getInstance().setAcceptCookie(true);
        // Geeft het ploegwachtwoord aan de site (alleen herenvanfatsoen.be wordt in deze app geladen).
        web.addJavascriptInterface(new Object() {
            @JavascriptInterface public String wachtwoord() {
                String url = web.getUrl();
                return url != null && url.startsWith("https://") && Uri.parse(url).getHost() != null
                        && Uri.parse(url).getHost().endsWith("herenvanfatsoen.be") ? BuildConfig.TEAM_WACHTWOORD : "";
            }
        }, "HVFApp");

        // Alleen "naar beneden trekken om te vernieuwen" als de pagina helemaal bovenaan staat.
        refresh.setOnChildScrollUpCallback((parent, child) -> web.getScrollY() > 0);
        refresh.setOnRefreshListener(() -> web.reload());

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String host = uri.getHost() == null ? "" : uri.getHost();
                boolean eigen = "https".equals(uri.getScheme())
                        && (host.equals("herenvanfatsoen.be") || host.endsWith(".herenvanfatsoen.be") || host.endsWith("herenvanfatsoen.pages.dev"));
                if (eigen) return false;
                // Andere sites (LZV, Google Maps, sponsors), mail en telefoon: openen in de juiste app.
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (ActivityNotFoundException ignored) { }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                refresh.setRefreshing(false);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    refresh.setRefreshing(false);
                    view.loadDataWithBaseURL(null,
                            "<html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head>"
                                    + "<body style='font-family:sans-serif;background:#F4F6F3;color:#151D18;display:flex;align-items:center;justify-content:center;height:90vh;text-align:center;padding:24px'>"
                                    + "<div><h2 style='color:#C51F2A'>Geen verbinding</h2><p>Controleer je internet en trek de pagina naar beneden om opnieuw te proberen.</p>"
                                    + "<p><a href='" + START_URL + "' style='color:#C51F2A;font-weight:bold'>Opnieuw proberen</a></p></div></body></html>",
                            "text/html", "utf-8", START_URL);
                }
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            // Foto's en video's kiezen voor Ballon T'orrie
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/*", "video/*"});
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                try {
                    startActivityForResult(Intent.createChooser(i, "Kies foto's of video's"), FILE_REQUEST);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }

            // Video's schermvullend afspelen
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) { callback.onCustomViewHidden(); return; }
                customView = view;
                customViewCallback = callback;
                root.addView(view, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
                refresh.setVisibility(View.GONE);
            }

            @Override
            public void onHideCustomView() {
                if (customView == null) return;
                root.removeView(customView);
                customView = null;
                refresh.setVisibility(View.VISIBLE);
                if (customViewCallback != null) customViewCallback.onCustomViewHidden();
            }
        });

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            Uri data = getIntent() != null ? getIntent().getData() : null;
            web.loadUrl(data != null ? data.toString() : START_URL);
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent != null && intent.getData() != null) web.loadUrl(intent.getData().toString());
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_REQUEST || fileCallback == null) return;
        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int n = data.getClipData().getItemCount();
                result = new Uri[n];
                for (int k = 0; k < n; k++) result[k] = data.getClipData().getItemAt(k).getUri();
            } else if (data.getData() != null) {
                result = new Uri[]{data.getData()};
            }
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (customView != null) {
            web.getWebChromeClient().onHideCustomView();
        } else if (web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }
}
