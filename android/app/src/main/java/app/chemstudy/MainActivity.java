package app.chemstudy;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

public class MainActivity extends Activity {
    private WebView web;
    private LinearLayout errorPanel;
    private ProgressBar progress;
    private final Uri home = Uri.parse(BuildConfig.APP_URL);

    @Override public void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(251,250,246));
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view,insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                view.setPadding(bars.left,bars.top,bars.right,bars.bottom);
                return insets;
            });
        }
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(251,250,246));
        root.addView(web,new FrameLayout.LayoutParams(-1,-1));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        errorPanel = new LinearLayout(this);
        errorPanel.setOrientation(LinearLayout.VERTICAL);
        errorPanel.setGravity(Gravity.CENTER);
        errorPanel.setPadding(50,50,50,50);
        errorPanel.setBackgroundColor(Color.rgb(251,250,246));
        TextView title = new TextView(this);
        title.setText("사이트에 연결하지 못했습니다.");
        title.setTextSize(19);
        title.setTextColor(Color.rgb(11,59,48));
        title.setGravity(Gravity.CENTER);
        errorPanel.addView(title);
        TextView detail = new TextView(this);
        detail.setText("인터넷 연결을 확인하고 다시 시도해 주세요.");
        detail.setGravity(Gravity.CENTER);
        detail.setPadding(0,25,0,30);
        errorPanel.addView(detail);
        Button retry = new Button(this);
        retry.setText("다시 연결하기");
        retry.setOnClickListener(view -> {errorPanel.setVisibility(View.GONE);web.setVisibility(View.VISIBLE);web.loadUrl(home.toString());});
        errorPanel.addView(retry);
        root.addView(errorPanel,new FrameLayout.LayoutParams(-1,-1));
        errorPanel.setVisibility(View.GONE);

        progress = new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);
        FrameLayout.LayoutParams progressLayout = new FrameLayout.LayoutParams(-1,6,Gravity.TOP);
        root.addView(progress,progressLayout);
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view,int value) {
                progress.setProgress(value);
                progress.setVisibility(value>=100?View.GONE:View.VISIBLE);
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isInternal(uri)) return false;
                if ("https".equals(uri.getScheme())) {
                    try {startActivity(new Intent(Intent.ACTION_VIEW,uri));} catch (android.content.ActivityNotFoundException ignored) { showError(); }
                }
                return true;
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error) {
                if (request.isForMainFrame()) showError();
            }
            @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode()>=400) showError();
            }
        });
        if (savedState == null || web.restoreState(savedState) == null) web.loadUrl(home.toString());
    }
    private boolean isInternal(Uri uri) {
        return "https".equals(uri.getScheme()) && home.getHost().equalsIgnoreCase(uri.getHost()) && normalizedPort(home)==normalizedPort(uri) && uri.getUserInfo()==null;
    }
    private int normalizedPort(Uri uri) { return uri.getPort()==-1?443:uri.getPort(); }
    private void showError() {web.setVisibility(View.GONE);errorPanel.setVisibility(View.VISIBLE);progress.setVisibility(View.GONE);}
    @Override protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }
    @Override protected void onPause() {
        if (web != null) web.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }
    @Override public void onBackPressed() {if(web.canGoBack())web.goBack();else super.onBackPressed();}
    @Override protected void onSaveInstanceState(Bundle outState) {web.saveState(outState);super.onSaveInstanceState(outState);}
    @Override protected void onDestroy() {web.destroy();super.onDestroy();}
}
