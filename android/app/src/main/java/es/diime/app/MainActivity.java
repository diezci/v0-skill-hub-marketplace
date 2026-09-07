package es.diime.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String GOOGLE_PAY_USER_AGENT_TOKEN = "GOOGLE_PAY_SUPPORTED";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Capacitor muestra el checkout web de Stripe dentro de esta WebView.
        // Payment Request viene desactivado por defecto en Android WebView, por
        // lo que Google Pay no puede anunciarse aunque esté activo en Stripe.
        WebView webView = bridge.getWebView();
        WebSettings settings = webView.getSettings();

        if (WebViewFeature.isFeatureSupported(WebViewFeature.PAYMENT_REQUEST)) {
            WebSettingsCompat.setPaymentRequestEnabled(settings, true);
        }

        String userAgent = settings.getUserAgentString();
        if (userAgent != null && !userAgent.contains(GOOGLE_PAY_USER_AGENT_TOKEN)) {
            settings.setUserAgentString(userAgent + " " + GOOGLE_PAY_USER_AGENT_TOKEN);
        }
    }
}
