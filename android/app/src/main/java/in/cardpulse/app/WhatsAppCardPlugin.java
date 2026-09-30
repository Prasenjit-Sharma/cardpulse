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
import java.util.ArrayList;

/**
 * "Share my card" from a contact: hands the user's card picture and vCard to WhatsApp with the contact's number, so
 * WhatsApp opens that chat with the files ready to send. The "jid" extra is not documented by WhatsApp, but is widely used; when WhatsApp
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

    /** Files in the order given (the card picture, then the vCard). One file goes as a single share, several together. */
    @PluginMethod
    public void send(PluginCall call) {
        String jid = call.getString("jid"), pkg = call.getString("pkg");
        JSArray uris = call.getArray("uris", new JSArray());
        if (uris.length() == 0 || jid == null || pkg == null || !jid.matches("\\d{8,15}")) { call.reject("Missing or bad details"); return; }
        ArrayList<Uri> content = new ArrayList<>();
        try {
            for (int i = 0; i < uris.length(); i++) {
                File file = new File(Uri.parse(uris.getString(i)).getPath());
                content.add(FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file));
            }
        } catch (Exception e) { call.reject("Could not read the card files", e); return; }
        Intent intent;
        if (content.size() == 1) {
            intent = new Intent(Intent.ACTION_SEND);
            intent.setType("text/x-vcard");
            intent.putExtra(Intent.EXTRA_STREAM, content.get(0));
        } else {
            intent = new Intent(Intent.ACTION_SEND_MULTIPLE);
            intent.setType("*/*");
            intent.putParcelableArrayListExtra(Intent.EXTRA_STREAM, content);
        }
        ClipData clip = ClipData.newRawUri("", content.get(0));
        for (int i = 1; i < content.size(); i++) clip.addItem(new ClipData.Item(content.get(i)));
        intent.setClipData(clip);
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
