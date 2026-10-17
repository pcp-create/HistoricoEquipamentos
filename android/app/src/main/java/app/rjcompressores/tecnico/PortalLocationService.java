package app.rjcompressores.tecnico;
import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.net.*;
import android.os.*;
import android.webkit.CookieManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import org.json.*;

/** Started while the portal is visible; maintains five-minute presence when locked. */
public final class PortalLocationService extends Service {
    static final long INTERVAL=300000;
    private static final String CHANNEL="portal_location";
    private final Handler main=new Handler(Looper.getMainLooper());
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private NativeLocation location;
    private ConnectivityManager.NetworkCallback network;
    private boolean busy=false,closed=false,started=false;
    private long lastSuccess=0;
    private final Runnable tick=new Runnable(){public void run(){if(closed)return;collect();if(!closed)main.postDelayed(this,INTERVAL);}};
    static boolean eligible(JSONObject home){return home!=null&&home.optBoolean("isTechnician",false);}
    @Override public void onCreate(){
        super.onCreate();location=new NativeLocation(this);
        if(Build.VERSION.SDK_INT>=26){NotificationChannel channel=new NotificationChannel(CHANNEL,"Localização em segundo plano",NotificationManager.IMPORTANCE_LOW);channel.setSound(null,null);getSystemService(NotificationManager.class).createNotificationChannel(channel);}
        PendingIntent open=PendingIntent.getActivity(this,2103,new Intent(this,PortalActivity.class),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        Notification n=new NotificationCompat.Builder(this,CHANNEL).setSmallIcon(R.drawable.ic_notification).setContentTitle("Portal Técnico RJ").setContentText("Serviço de localização ativo").setOngoing(true).setOnlyAlertOnce(true).setSilent(true).setContentIntent(open).setPriority(NotificationCompat.PRIORITY_LOW).build();
        try{ServiceCompat.startForeground(this,2103,n,Build.VERSION.SDK_INT>=29?ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION:0);}catch(SecurityException e){stopSelf();return;}
        started=true;
        network=new ConnectivityManager.NetworkCallback(){@Override public void onCapabilitiesChanged(Network n,NetworkCapabilities c){if(c.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED))main.post(()->collect());}};
        getSystemService(ConnectivityManager.class).registerDefaultNetworkCallback(network);
        main.post(tick);
    }
    @Override public int onStartCommand(Intent intent,int flags,int id){collect();return START_NOT_STICKY;}
    private boolean connected(){ConnectivityManager c=getSystemService(ConnectivityManager.class);NetworkCapabilities n=c.getNetworkCapabilities(c.getActiveNetwork());return n!=null&&n.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);}
    private void collect(){
        if(!started||closed||busy||!connected()||SystemClock.elapsedRealtime()-lastSuccess<INTERVAL&&lastSuccess>0)return;
        busy=true;
        io.execute(()->{
            String owner=null;
            try(PortalDatabase db=new PortalDatabase(this)){JSONObject home=PortalNotifications.home(db);Object stored=db.read("owner");if(stored instanceof String&&eligible(home))owner=(String)stored;}catch(Exception ignored){}
            final String account=owner;
            main.post(()->{
                if(closed)return;
                if(account==null){busy=false;stopSelf();return;}
                location.request(30000,45000,(position,error,code)->{
                    if(closed)return;
                    if(error!=null){busy=false;return;}
                    final String cookie=CookieManager.getInstance().getCookie(PortalActivity.ORIGIN);
                    io.execute(()->send(account,cookie,position));
                });
            });
        });
    }
    private void send(String account,String cookie,JSONObject position){
        HttpURLConnection request=null;
        try{
            try(PortalDatabase db=new PortalDatabase(this)){if(!account.equals(db.read("owner")))return;}
            JSONObject coords=position.getJSONObject("coords");
            java.text.SimpleDateFormat format=new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",java.util.Locale.US);format.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
            JSONObject body=new JSONObject().put("latitude",coords.getDouble("latitude")).put("longitude",coords.getDouble("longitude")).put("accuracy",coords.getDouble("accuracy")).put("at",format.format(new java.util.Date(position.getLong("timestamp")))).put("owner",account);
            request=(HttpURLConnection)new URL(PortalActivity.ORIGIN+"/api/field/map").openConnection();request.setRequestMethod("POST");request.setDoOutput(true);request.setConnectTimeout(15000);request.setReadTimeout(15000);request.setInstanceFollowRedirects(false);request.setRequestProperty("Origin",PortalActivity.ORIGIN);request.setRequestProperty("Content-Type","application/json");if(cookie!=null)request.setRequestProperty("Cookie",cookie);
            try(OutputStream output=request.getOutputStream()){output.write(body.toString().getBytes(StandardCharsets.UTF_8));}
            int code=request.getResponseCode();
            for(java.util.Map.Entry<String,java.util.List<String>> header:request.getHeaderFields().entrySet())if("Set-Cookie".equalsIgnoreCase(header.getKey()))for(String value:header.getValue())CookieManager.getInstance().setCookie(PortalActivity.ORIGIN,value);
            CookieManager.getInstance().flush();
            if(code>=200&&code<300)main.post(()->{if(closed)return;lastSuccess=SystemClock.elapsedRealtime();main.removeCallbacks(tick);main.postDelayed(tick,INTERVAL);});
            else if(code==401||code==403)main.post(this::stopSelf);
        }catch(Exception ignored){}finally{if(request!=null)request.disconnect();main.post(()->busy=false);}
    }
    @Override public void onTaskRemoved(Intent intent){stopSelf();super.onTaskRemoved(intent);}
    @Override public IBinder onBind(Intent intent){return null;}
    @Override public void onDestroy(){closed=true;main.removeCallbacksAndMessages(null);if(location!=null)location.close();if(network!=null)getSystemService(ConnectivityManager.class).unregisterNetworkCallback(network);io.shutdown();super.onDestroy();}
}
