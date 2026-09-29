package in.cardpulse.app;

import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

/**
 * "Share my card" from a contact: hands the user's vCard to WhatsApp with the contact's number, so WhatsApp opens that
 * chat with the file ready to send. The "jid" extra is not documented by WhatsApp, but is widely used; when WhatsApp
 * refuses, the app falls back to the share sheet.
 */
@CapacitorPlugin(name = "WhatsAppCard")
public class WhatsAppCardPlugin extends Plugin {
    private static final String[] APPS = { "com.whatsapp", "com.whatsapp.w4b" };

    @PluginMethod
    public void installed(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        JSArray apps = new JSArray();
        for (String p : APPS) {
            try { pm.getPackageInfo(p, 0); apps.put(p); } catch (PackageManager.NameNotFoundException ignored) { }
        }
        JSObject out = new JSObject();
        out.put("apps", apps);
        call.resolve(out);
    }

    @PluginMethod
    public void send(PluginCall call) {
        String uri = call.getString("uri"), jid = call.getString("jid"), pkg = call.getString("pkg");
        if (uri == null || jid == null || pkg == null || !jid.matches("\\d{8,15}")) { call.reject("Missing or bad details"); return; }
        Uri content;
        try {
            File file = new File(Uri.parse(uri).getPath());
            content = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
        } catch (Exception e) { call.reject("Could not read the card file", e); return; }
        Intent intent = new Intent(Intent.ACTION_SEND);
        intent.setType("text/x-vcard");
        intent.putExtra(Intent.EXTRA_STREAM, content);
        intent.setClipData(ClipData.newRawUri("", content));
        intent.putExtra("jid", jid + "@s.whatsapp.net");
        intent.setPackage(pkg);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("WhatsApp is not installed", "NO_WHATSAPP");
        }
    }
}
