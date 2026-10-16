package app.rjcompressores.tecnico;
import android.content.*;
public final class PauseAlarmReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent){
        PendingResult pending=goAsync();
        new Thread(()->{try(PortalDatabase db=new PortalDatabase(context)){
            if("app.rjcompressores.tecnico.PAUSE_LIMIT".equals(intent.getAction()))PortalNotifications.deliver(context,db,intent.getStringExtra("key"));
            else PortalNotifications.update(context,db,true);
        }catch(Exception e){android.util.Log.e("PortalNotifications","Não foi possível atualizar o aviso de pausa",e);}finally{pending.finish();}},"portal-pause-alarm").start();
    }
}
