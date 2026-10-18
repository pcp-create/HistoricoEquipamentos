package app.rjcompressores.tecnico;
import static org.junit.Assert.*;
import android.Manifest;
import android.content.Context;
import android.location.LocationManager;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28)
public class LocationRequirementTest {
    private boolean contains(View view,String text){
        if(view instanceof TextView && ((TextView)view).getText().toString().equals(text))return true;
        if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++)if(contains(((ViewGroup)view).getChildAt(i),text))return true;
        return false;
    }
    private String content(View view){
        String value=view instanceof TextView?((TextView)view).getText().toString()+" | ":"";
        if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++)value+=content(((ViewGroup)view).getChildAt(i));
        return value;
    }
    @Test public void requiresPermissionAndEnabledLocationBeforePortalAccess(){
        try(org.robolectric.android.controller.ActivityController<PortalActivity> controller=Robolectric.buildActivity(PortalActivity.class).create().start().resume()){
            PortalActivity activity=controller.get();
            assertFalse(activity.locationReady());
            assertTrue(contains(activity.getWindow().getDecorView(),"Ative a localização para continuar"));
            Shadows.shadowOf(RuntimeEnvironment.getApplication()).grantPermissions(Manifest.permission.ACCESS_FINE_LOCATION);
            LocationManager manager=(LocationManager)activity.getSystemService(Context.LOCATION_SERVICE);
            Shadows.shadowOf(manager).setProviderEnabled(LocationManager.GPS_PROVIDER,false);
            Shadows.shadowOf(manager).setProviderEnabled(LocationManager.NETWORK_PROVIDER,false);
            assertFalse(activity.locationReady());
            Shadows.shadowOf(manager).setProviderEnabled(LocationManager.GPS_PROVIDER,true);
            assertTrue(activity.locationReady());
            Shadows.shadowOf(RuntimeEnvironment.getApplication()).denyPermissions(Manifest.permission.ACCESS_FINE_LOCATION);
            assertFalse(activity.locationReady());
        }
    }
    @Test public void showsAndroidLoginWithoutDownloadingAWebsite() throws Exception {
        Shadows.shadowOf(RuntimeEnvironment.getApplication()).grantPermissions(Manifest.permission.ACCESS_FINE_LOCATION);
        LocationManager manager=(LocationManager)RuntimeEnvironment.getApplication().getSystemService(Context.LOCATION_SERVICE);
        Shadows.shadowOf(manager).setProviderEnabled(LocationManager.GPS_PROVIDER,true);
        try(org.robolectric.android.controller.ActivityController<PortalActivity> controller=Robolectric.buildActivity(PortalActivity.class).create().start().resume()){
            PortalActivity activity=controller.get();
            // Wait for the actual local-database task instead of racing a cold
            // Robolectric SQLite initialization against a ten-second polling loop.
            java.lang.reflect.Field ioField=PortalActivity.class.getDeclaredField("io");
            ioField.setAccessible(true);
            java.util.concurrent.ExecutorService io=(java.util.concurrent.ExecutorService)ioField.get(activity);
            io.submit(()->{}).get(30,java.util.concurrent.TimeUnit.SECONDS);
            org.robolectric.shadows.ShadowLooper.idleMainLooper();
            assertTrue(contains(activity.getWindow().getDecorView(),"Portal Técnico RJ"));
            assertTrue(content(activity.getWindow().getDecorView()),contains(activity.getWindow().getDecorView(),"E-mail"));
            assertTrue(contains(activity.getWindow().getDecorView(),"Senha"));
            assertTrue(contains(activity.getWindow().getDecorView(),"Entrar"));
        }
    }

}
