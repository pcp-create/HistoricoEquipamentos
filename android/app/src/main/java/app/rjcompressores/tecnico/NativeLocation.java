package app.rjcompressores.tecnico;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.*;
import android.os.*;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

/** One-shot native fixes. No background tracking or fabricated coordinates. */
final class NativeLocation {
    interface Callback { void complete(JSONObject position, String error, int code); }
    private final Context context;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final List<Runnable> cancellations = new ArrayList<>();
    NativeLocation(Context context) { this.context=context; }
    static boolean fresh(Location p,long age) {
        if(p==null||!p.hasAccuracy()||p.getAccuracy()<0||!Float.isFinite(p.getAccuracy())||!Double.isFinite(p.getLatitude())||!Double.isFinite(p.getLongitude()))return false;
        if(Math.abs(p.getLatitude())>90||Math.abs(p.getLongitude())>180)return false;
        long elapsed=SystemClock.elapsedRealtimeNanos()-p.getElapsedRealtimeNanos();
        return elapsed>=0&&elapsed<=age*1000000L&&Math.abs(System.currentTimeMillis()-p.getTime())<=300000;
    }
    void request(long maximumAge,long timeout,Callback callback) {
        if(Looper.myLooper()!=Looper.getMainLooper()){handler.post(()->request(maximumAge,timeout,callback));return;}
        if(context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){callback.complete(null,"Autorize a localização precisa em Permissões do aplicativo.",1);return;}
        LocationManager manager=(LocationManager)context.getSystemService(Context.LOCATION_SERVICE);
        List<String> providers=manager.getProviders(true);
        if(!providers.contains(LocationManager.GPS_PROVIDER)&&!providers.contains(LocationManager.NETWORK_PROVIDER)){callback.complete(null,"Ative a localização do aparelho e tente novamente.",1);return;}
        long age=Math.max(0,Math.min(30000,maximumAge));
        Location best=null;
        for(String provider:providers)try{Location last=manager.getLastKnownLocation(provider);if(fresh(last,age)&&(best==null||last.getAccuracy()<best.getAccuracy()))best=last;}catch(SecurityException ignored){}
        if(best!=null){respond(best,callback);return;}
        final boolean[] finished={false};final LocationListener[] listener={null};final Runnable[] cancel={null};
        Runnable timeoutTask=()->{if(finished[0])return;finished[0]=true;manager.removeUpdates(listener[0]);cancellations.remove(cancel[0]);callback.complete(null,"A localização está autorizada, mas o aparelho ainda não obteve uma posição recente. Aguarde o sinal GPS, procure uma área aberta e tente novamente. O apontamento não foi salvo.",3);};
        cancel[0]=()->{if(finished[0])return;finished[0]=true;handler.removeCallbacks(timeoutTask);manager.removeUpdates(listener[0]);callback.complete(null,"Coleta de localização interrompida. Tente novamente.",2);};
        listener[0]=new LocationListener(){
            @Override public void onLocationChanged(Location p){if(finished[0]||!fresh(p,30000))return;finished[0]=true;handler.removeCallbacks(timeoutTask);manager.removeUpdates(this);cancellations.remove(cancel[0]);respond(p,callback);}
            @Override public void onProviderDisabled(String provider){}
            @Override public void onProviderEnabled(String provider){}
            @Override public void onStatusChanged(String provider,int status,Bundle extras){}
        };
        cancellations.add(cancel[0]);boolean requested=false;
        for(String provider:providers)if(!LocationManager.PASSIVE_PROVIDER.equals(provider))try{manager.requestLocationUpdates(provider,0,0,listener[0],Looper.getMainLooper());requested=true;}catch(IllegalArgumentException|SecurityException ignored){}
        if(!requested){cancel[0].run();cancellations.remove(cancel[0]);return;}
        handler.postDelayed(timeoutTask,Math.max(5000,Math.min(45000,timeout)));
    }
    private static void respond(Location p,Callback callback){try{callback.complete(new JSONObject().put("timestamp",p.getTime()).put("coords",new JSONObject().put("latitude",p.getLatitude()).put("longitude",p.getLongitude()).put("accuracy",p.getAccuracy())),null,0);}catch(Exception e){callback.complete(null,"Não foi possível ler a localização. Tente novamente.",2);}}
    void close(){for(Runnable cancel:new ArrayList<>(cancellations))cancel.run();cancellations.clear();}
}
