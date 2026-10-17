package app.rjcompressores.tecnico;
import static org.junit.Assert.*;
import android.Manifest;
import android.app.Notification;
import android.app.Service;
import android.content.Intent;
import android.content.ComponentName;
import android.content.pm.ServiceInfo;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;
@RunWith(RobolectricTestRunner.class)
@Config(sdk=28)
public class PortalLocationServiceTest {
 @Test public void silentLocationServiceStopsWithTaskAndDoesNotRestartAfterClose() throws Exception {
  Shadows.shadowOf(RuntimeEnvironment.getApplication()).grantPermissions(Manifest.permission.ACCESS_FINE_LOCATION);
  ServiceInfo info=RuntimeEnvironment.getApplication().getPackageManager().getServiceInfo(new ComponentName(RuntimeEnvironment.getApplication(),PortalLocationService.class),0);
  assertTrue((info.flags&ServiceInfo.FLAG_STOP_WITH_TASK)!=0);
  org.robolectric.android.controller.ServiceController<PortalLocationService> controller=Robolectric.buildService(PortalLocationService.class).create();
  try{
   PortalLocationService service=controller.get();
   Notification notice=Shadows.shadowOf(service).getLastForegroundNotification();
   assertEquals("Serviço de localização ativo",notice.extras.getString(Notification.EXTRA_TEXT));
   assertTrue((notice.flags&Notification.FLAG_ONLY_ALERT_ONCE)!=0);
   assertEquals(Service.START_NOT_STICKY,service.onStartCommand(new Intent(),0,1));
   service.onTaskRemoved(new Intent());
   assertTrue(Shadows.shadowOf(service).isStoppedBySelf());
  }finally{controller.destroy();}
 }
}
