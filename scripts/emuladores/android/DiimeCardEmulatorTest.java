package es.diime.app;

import android.app.Instrumentation;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Bitmap;
import android.os.SystemClock;
import android.webkit.WebView;

import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.junit.Test;

import java.io.File;
import java.io.FileOutputStream;
import java.io.PrintWriter;
import java.util.Arrays;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.TimeUnit;

import static org.junit.Assert.*;

public class DiimeCardEmulatorTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();

    private String evaluate(WebView web, String script) throws InterruptedException {
        ArrayBlockingQueue<String> result = new ArrayBlockingQueue<>(1);
        instrumentation.runOnMainSync(() -> web.evaluateJavascript(script, result::offer));
        String response = result.poll(10, TimeUnit.SECONDS);
        assertNotNull("No response from the Android WebView", response);
        return response;
    }

    @Test public void cardGeometryInBothOrientations() throws Exception {
        Intent intent = new Intent(instrumentation.getTargetContext(), MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        MainActivity activity = (MainActivity) instrumentation.startActivitySync(intent);
        WebView web = activity.getBridge().getWebView();
        String[] files = activity.getAssets().list("public/layout");
        Arrays.sort(files);
        assertEquals("Expected ES/EN, grid/list/home and two font sizes", 12, files.length);
        File dir = new File(activity.getFilesDir(), "emulator-layout");
        assertTrue(dir.isDirectory() || dir.mkdirs());

        try (PrintWriter report = new PrintWriter(new File(dir, "results.txt"), "UTF-8")) {
            report.println("Android " + android.os.Build.VERSION.RELEASE + " / WebView " +
                WebView.getCurrentWebViewPackage().versionName);
            for (boolean portrait : new boolean[] {true, false}) {
                String orientation = portrait ? "portrait" : "landscape";
                instrumentation.runOnMainSync(() -> activity.setRequestedOrientation(portrait
                    ? ActivityInfo.SCREEN_ORIENTATION_PORTRAIT : ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE));
                for (String file : files) {
                    String url = "https://localhost/layout/" + file;
                    instrumentation.runOnMainSync(() -> web.loadUrl(url));
                    String check = "(() => { if (location.href !== " + JSONObject.quote(url) +
                        " || !window.runLayoutChecks || document.readyState !== 'complete' || " +
                        " document.fonts.status !== 'loaded' || (innerHeight > innerWidth) !== " + portrait +
                        ") return null; const r = window.runLayoutChecks(); return {passed:r.passed,error:r.error," +
                        " platform:document.documentElement.dataset.nativePlatform,width:innerWidth,height:innerHeight}; })()";
                    String result;
                    long until = SystemClock.elapsedRealtime() + 25000;
                    do {
                        SystemClock.sleep(120);
                        result = evaluate(web, check);
                    } while ("null".equals(result) && SystemClock.elapsedRealtime() < until);
                    report.println(orientation + " " + file + " " + result);
                    report.flush();
                    assertNotEquals("Fixture did not load in " + orientation + ": " + file, "null", result);
                    JSONObject status = new JSONObject(result);
                    assertEquals(file, "android", status.optString("platform"));
                    boolean passed = status.optBoolean("passed");
                    if (!passed || (file.contains("-es-") && file.contains("16"))) {
                        evaluate(web, "document.querySelector('[data-slot=card]')?.scrollIntoView()");
                        SystemClock.sleep(180);
                        Bitmap shot = instrumentation.getUiAutomation().takeScreenshot();
                        assertNotNull("Screenshot of " + file, shot);
                        try (FileOutputStream stream = new FileOutputStream(new File(dir, orientation + "-" + file + ".png"))) {
                            shot.compress(Bitmap.CompressFormat.PNG, 100, stream);
                        } finally { shot.recycle(); }
                    }
                    assertTrue(orientation + ", " + file + ": " + result, passed);
                }
            }
        } finally {
            instrumentation.runOnMainSync(activity::finish);
        }
    }
}
