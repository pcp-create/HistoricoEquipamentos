package app.rjcompressores.tecnico;
import static org.junit.Assert.*;
import android.app.*;
import android.content.*;
import android.net.Uri;
import android.location.Location;
import android.os.SystemClock;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import org.json.*;
import java.time.Instant;

@RunWith(RobolectricTestRunner.class) @Config(sdk=28)
public class PortalNotificationsTest {
    @Test public void nativeOriginAcceptsCanonicalSlashButRejectsOtherSites(){
        assertTrue(PortalActivity.trustedOrigin(Uri.parse("https://rjcompressores.app/")));
        assertFalse(PortalActivity.trustedOrigin(Uri.parse("https://rjcompressores.app.evil/")));
        assertFalse(PortalActivity.trustedOrigin(Uri.parse("http://rjcompressores.app")));
    }
    @Test public void rejectsStaleGpsAndAcceptsFreshFix(){
        Location p=new Location("gps");p.setAccuracy(10);p.setLatitude(-27);p.setLongitude(-49);
        p.setTime(System.currentTimeMillis());p.setElapsedRealtimeNanos(SystemClock.elapsedRealtimeNanos());
        assertTrue(NativeLocation.fresh(p,30000));p.setTime(System.currentTimeMillis()-600000);assertFalse(NativeLocation.fresh(p,30000));
    }
    @Test public void pauseAlertUsesSavedDeadlineAndCancelsWhenResumed()throws Exception{
        Context c=RuntimeEnvironment.getApplication();PortalDatabase db=new PortalDatabase(c);
        JSONObject active=new JSONObject().put("id","session").put("operation_id","op").put("state","paused").put("kind","work").put("segment_at",Instant.ofEpochMilli(System.currentTimeMillis()-120000).toString()).put("pause_alert_at",Instant.ofEpochMilli(System.currentTimeMillis()-120000).toString()).put("pause_reason",new JSONObject().put("name","Portaria").put("minutes",1));
        JSONObject home=new JSONObject().put("email","tech").put("active",active);
        save(db,home);PortalNotifications.update(c,db,true);
        NotificationManager nm=c.getSystemService(NotificationManager.class);
        Notification ongoing=Shadows.shadowOf(nm).getNotification(PortalNotifications.ACTIVE_ID);
        assertNotNull(ongoing);assertTrue((ongoing.flags&Notification.FLAG_ONGOING_EVENT)!=0);
        assertEquals(Notification.VISIBILITY_PUBLIC,ongoing.visibility);
        assertNotNull(Shadows.shadowOf(nm).getNotification(PortalNotifications.PAUSE_ID));
        String stale=PortalNotifications.alertKey(home);
        active.put("state","running").put("pause_reason",JSONObject.NULL);save(db,home);PortalNotifications.update(c,db,false);
        assertNull(Shadows.shadowOf(nm).getNotification(PortalNotifications.PAUSE_ID));
        PortalNotifications.deliver(c,db,stale);assertNull(Shadows.shadowOf(nm).getNotification(PortalNotifications.PAUSE_ID));
        home.put("active",JSONObject.NULL);save(db,home);PortalNotifications.update(c,db,false);
        assertNull(Shadows.shadowOf(nm).getNotification(PortalNotifications.ACTIVE_ID));db.close();
    }
    private void save(PortalDatabase db,JSONObject home)throws Exception{db.write(new JSONArray().put(new JSONArray().put("owner").put("tech")).put(new JSONArray().put("tech:cache:/api/field").put(home)));}
}
