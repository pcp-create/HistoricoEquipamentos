package app.rjcompressores.tecnico;

import android.net.Uri;
import com.google.androidbrowserhelper.trusted.LauncherActivity;

/** Every app launch opens the technician portal, including external intents. */
public class PortalActivity extends LauncherActivity {
    @Override
    protected Uri getLaunchingUrl() {
        return Uri.parse("https://rjcompressores.app/tecnico");
    }
}
