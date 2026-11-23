package app.rjcompressores.tecnico;

import static org.junit.Assert.*;
import android.Manifest;
import android.content.Context;
import android.location.Location;
import android.location.LocationManager;
import android.os.SystemClock;
import java.time.Duration;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28)
public class NativeLocationTest {
 private LocationManager manager(){
  Shadows.shadowOf(RuntimeEnvironment.getApplication()).grantPermissions(Manifest.permission.ACCESS_FINE_LOCATION);
  LocationManager manager=(LocationManager)RuntimeEnvironment.getApplication().getSystemService(Context.LOCATION_SERVICE);
  Shadows.shadowOf(manager).setProviderEnabled(LocationManager.GPS_PROVIDER,true);
  Shadows.shadowOf(manager).setProviderEnabled(LocationManager.NETWORK_PROVIDER,true);
  return manager;
 }
 @Test public void presenceStartsWithNetworkAndStopsAllProvidersAtDeadline(){
  LocationManager manager=manager();
  NativeLocation location=new NativeLocation(RuntimeEnvironment.getApplication());
  int[] responses={0};
  location.requestPresence((position,error,code)->{responses[0]++;assertNull(position);assertNotNull(error);});
  assertEquals(0,Shadows.shadowOf(manager).getLocationUpdateListeners(LocationManager.GPS_PROVIDER).size());
  assertEquals(1,Shadows.shadowOf(manager).getLocationUpdateListeners(LocationManager.NETWORK_PROVIDER).size());
  Shadows.shadowOf(android.os.Looper.getMainLooper()).idleFor(Duration.ofSeconds(8));
  assertEquals(1,Shadows.shadowOf(manager).getLocationUpdateListeners(LocationManager.GPS_PROVIDER).size());
  Shadows.shadowOf(android.os.Looper.getMainLooper()).idleFor(Duration.ofSeconds(7));
  assertEquals(1,responses[0]);
  assertEquals(0,Shadows.shadowOf(manager).getLocationUpdateListeners().size());
  location.close();
 }
 @Test public void cachedPresenceDoesNotRelaxPointRegistrationFreshness(){
  LocationManager manager=manager();
  Shadows.shadowOf(android.os.Looper.getMainLooper()).idleFor(Duration.ofMinutes(3));
  Location cached=new Location(LocationManager.GPS_PROVIDER);
  cached.setLatitude(-27);cached.setLongitude(-49);cached.setAccuracy(12);
  cached.setTime(System.currentTimeMillis()-60000);
  cached.setElapsedRealtimeNanos(SystemClock.elapsedRealtimeNanos()-60000000000L);
  Shadows.shadowOf(manager).setLastKnownLocation(LocationManager.GPS_PROVIDER,cached);
  NativeLocation location=new NativeLocation(RuntimeEnvironment.getApplication());
  int[] responses={0};
  location.requestPresence((position,error,code)->{responses[0]++;assertNotNull(position);assertNull(error);assertEquals(cached.getTime(),position.optLong("timestamp"));});
  assertEquals(1,responses[0]);
  assertEquals(0,Shadows.shadowOf(manager).getLocationUpdateListeners().size());
  location.request(30000,45000,(position,error,code)->{});
  assertEquals(1,Shadows.shadowOf(manager).getLocationUpdateListeners(LocationManager.GPS_PROVIDER).size());
  location.close();
  assertEquals(0,Shadows.shadowOf(manager).getLocationUpdateListeners().size());
 }
 @Test public void closingPresenceCancelsDelayedGps(){
  LocationManager manager=manager();
  NativeLocation location=new NativeLocation(RuntimeEnvironment.getApplication());
  location.requestPresence((position,error,code)->{});
  location.close();
  Shadows.shadowOf(android.os.Looper.getMainLooper()).idleFor(Duration.ofSeconds(20));
  assertEquals(0,Shadows.shadowOf(manager).getLocationUpdateListeners().size());
 }
}
