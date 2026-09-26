package in.cardpulse.app;

import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.provider.ContactsContract;
import android.provider.ContactsContract.CommonDataKinds.Email;
import android.provider.ContactsContract.CommonDataKinds.Phone;
import android.provider.ContactsContract.CommonDataKinds.Website;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import org.json.JSONObject;

/**
 * "Save to phone": opens the phone's own new-contact screen, filled in. The user picks the account there (Google,
 * Outlook, the phone) and taps Save, so the app needs no contacts permission and never writes to Contacts itself.
 */
@CapacitorPlugin(name = "SaveContact")
public class SaveContactPlugin extends Plugin {

    @PluginMethod
    public void insert(PluginCall call) {
        Intent intent = new Intent(ContactsContract.Intents.Insert.ACTION);
        intent.setType(ContactsContract.RawContacts.CONTENT_TYPE);
        intent.putExtra(ContactsContract.Intents.Insert.NAME, call.getString("name", ""));
        intent.putExtra(ContactsContract.Intents.Insert.COMPANY, call.getString("company", ""));
        intent.putExtra(ContactsContract.Intents.Insert.JOB_TITLE, call.getString("title", ""));
        intent.putExtra(ContactsContract.Intents.Insert.POSTAL, call.getString("address", ""));
        intent.putExtra(ContactsContract.Intents.Insert.NOTES, call.getString("note", ""));

        // Every number, email and the website go in as data rows, so none is dropped (the plain extras hold three at most).
        ArrayList<ContentValues> rows = new ArrayList<>();
        try {
            JSArray phones = call.getArray("phones", new JSArray());
            for (int i = 0; i < phones.length(); i++) {
                JSONObject p = phones.getJSONObject(i);
                ContentValues v = new ContentValues();
                v.put(ContactsContract.Data.MIMETYPE, Phone.CONTENT_ITEM_TYPE);
                v.put(Phone.NUMBER, p.optString("number"));
                v.put(Phone.TYPE, p.optInt("type", Phone.TYPE_MOBILE));
                if (i == 0) v.put(ContactsContract.Data.IS_PRIMARY, 1);
                rows.add(v);
            }
            JSArray emails = call.getArray("emails", new JSArray());
            for (int i = 0; i < emails.length(); i++) {
                ContentValues v = new ContentValues();
                v.put(ContactsContract.Data.MIMETYPE, Email.CONTENT_ITEM_TYPE);
                v.put(Email.ADDRESS, emails.getString(i));
                v.put(Email.TYPE, Email.TYPE_WORK);
                rows.add(v);
            }
        } catch (Exception e) {
            call.reject("Could not read the contact", e);
            return;
        }
        String website = call.getString("website", "");
        if (website != null && !website.isEmpty()) {
            ContentValues v = new ContentValues();
            v.put(ContactsContract.Data.MIMETYPE, Website.CONTENT_ITEM_TYPE);
            v.put(Website.URL, website);
            v.put(Website.TYPE, Website.TYPE_WORK);
            rows.add(v);
        }
        intent.putParcelableArrayListExtra(ContactsContract.Intents.Insert.DATA, rows);
        intent.putExtra("finishActivityOnSaveCompleted", true);   // Contacts returns to CardPulse after Save

        try {
            getActivity().startActivity(intent);
            call.resolve(new JSObject());
        } catch (ActivityNotFoundException e) {
            call.reject("No contacts app on this phone", "NO_CONTACTS_APP");
        }
    }
}
