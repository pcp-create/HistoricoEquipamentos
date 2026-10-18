package app.rjcompressores.tecnico;

import android.app.*;
import android.content.*;
import android.os.Build;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import org.json.*;
import java.text.SimpleDateFormat;
import java.util.Locale;

/** OS-rendered chronometer and persisted AlarmManager deadline; no JS timer dependency. */
final class PortalNotifications {
    static final String ACTIVE_CHANNEL="portal_activity", PAUSE_CHANNEL="portal_pause_limit", SCHEDULE_CHANNEL="portal_schedule";
    static final int ACTIVE_ID=2101, PAUSE_ID=2102;
    static void channels(Context context){
        if(Build.VERSION.SDK_INT<26)return;
        NotificationManager manager=context.getSystemService(NotificationManager.class);
        NotificationChannel active=new NotificationChannel(ACTIVE_CHANNEL,"Apontamento em andamento",NotificationManager.IMPORTANCE_LOW);
        active.setDescription("Atividade, deslocamento e pausa na tela de bloqueio.");active.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);active.setSound(null,null);
        NotificationChannel pause=new NotificationChannel(PAUSE_CHANNEL,"Limite de pausa",NotificationManager.IMPORTANCE_HIGH);
        pause.setDescription("Aviso quando a pausa atinge o limite cadastrado.");pause.enableVibration(true);pause.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        pause.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build());
        manager.createNotificationChannel(active);manager.createNotificationChannel(pause);
        manager.createNotificationChannel(new NotificationChannel(SCHEDULE_CHANNEL,"Alterações na programação",NotificationManager.IMPORTANCE_DEFAULT));
    }
    static long time(String value){
        if(value==null||value.isEmpty())return 0;
        for(String format:new String[]{"yyyy-MM-dd'T'HH:mm:ss.SSSXXX","yyyy-MM-dd'T'HH:mm:ssXXX"})try{SimpleDateFormat f=new SimpleDateFormat(format,Locale.US);f.setLenient(false);return f.parse(value).getTime();}catch(Exception ignored){}
        return 0;
    }
    static JSONObject home(PortalDatabase db)throws Exception{Object owner=db.read("owner");if(!(owner instanceof String))return null;Object home=db.read(owner+":cache:/api/field");return home instanceof JSONObject?(JSONObject)home:null;}
    static long deadline(JSONObject active){if(active==null||!"paused".equals(active.optString("state")))return 0;JSONObject reason=active.optJSONObject("pause_reason");int minutes=reason==null?0:reason.optInt("minutes",0);long start=time(active.optString("pause_alert_at",active.optString("segment_at")));return minutes>0&&start>0?start+minutes*60000L:0;}
    static String alertKey(JSONObject home){JSONObject active=home==null?null:home.optJSONObject("active");long due=deadline(active);return due==0?"":home.optString("email")+":"+active.optString("id")+":"+due;}
    static String label(JSONObject home,JSONObject active){JSONArray rows=home.optJSONArray("rows");if(rows!=null)for(int i=0;i<rows.length();i++){JSONObject row=rows.optJSONObject(i);if(row!=null&&row.optString("id").equals(active.optString("operation_id")))return "OS "+row.optString("number")+" / OP"+String.format(Locale.US,"%02d",row.optInt("position",1))+(row.optString("customer").isEmpty()?"":" · "+row.optString("customer"));}return "Portal Técnico RJ";}
    static PendingIntent open(Context context,JSONObject active){Intent intent=new Intent(context,PortalActivity.class).putExtra("operationId",active.optString("operation_id")).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP|Intent.FLAG_ACTIVITY_CLEAR_TOP);return PendingIntent.getActivity(context,active.optString("operation_id").hashCode(),intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    static PendingIntent alarm(Context context,String key){Intent intent=new Intent(context,PauseAlarmReceiver.class).setAction("app.rjcompressores.tecnico.PAUSE_LIMIT").putExtra("key",key);return PendingIntent.getBroadcast(context,2100,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);}
    static boolean exactAllowed(Context c){return Build.VERSION.SDK_INT<31||c.getSystemService(AlarmManager.class).canScheduleExactAlarms();}
    static synchronized void update(Context context,PortalDatabase db,boolean force)throws Exception{
        channels(context);scheduleChanges(context,db);JSONObject home=home(db),active=home==null?null:home.optJSONObject("active");
        NotificationManagerCompat notifications=NotificationManagerCompat.from(context);AlarmManager alarms=context.getSystemService(AlarmManager.class);
        SharedPreferences prefs=context.getSharedPreferences("portal-notifications",Context.MODE_PRIVATE);
        if(active==null||"finished".equals(active.optString("state"))){notifications.cancel(ACTIVE_ID);notifications.cancel(PAUSE_ID);alarms.cancel(alarm(context,""));prefs.edit().remove("signature").remove("delivered").apply();return;}
        String signature=home.optString("email")+active.toString()+label(home,active);
        if(!force&&signature.equals(prefs.getString("signature","")))return;
        boolean paused="paused".equals(active.optString("state"));String title=paused?"Apontamento em pausa":"travel".equals(active.optString("kind"))?"Deslocamento em andamento":"Atividade em andamento";
        JSONObject reason=active.optJSONObject("pause_reason");String detail=label(home,active)+(paused&&reason!=null?" · "+reason.optString("name"):"");
        long segment=time(active.optString("segment_at"));long base=paused?segment:segment-Math.max(0,active.optLong("active_seconds"))*1000L;
        Notification notification=new NotificationCompat.Builder(context,ACTIVE_CHANNEL).setSmallIcon(R.drawable.ic_notification).setContentTitle(title).setContentText(detail).setStyle(new NotificationCompat.BigTextStyle().bigText(detail+(paused?"\nToque para verificar ou retomar a atividade.":"\nToque para abrir a operação."))).setContentIntent(open(context,active)).setOngoing(true).setOnlyAlertOnce(true).setCategory(NotificationCompat.CATEGORY_STOPWATCH).setVisibility(NotificationCompat.VISIBILITY_PUBLIC).setPriority(NotificationCompat.PRIORITY_LOW).setWhen(base>0?base:System.currentTimeMillis()).setUsesChronometer(true).build();
        try{notifications.notify(ACTIVE_ID,notification);}catch(SecurityException ignored){}
        alarms.cancel(alarm(context,""));String key=alertKey(home);long due=deadline(active);
        if(!key.equals(prefs.getString("delivered","")))notifications.cancel(PAUSE_ID);
        if(!key.isEmpty()&&!key.equals(prefs.getString("delivered",""))){
            if(due<=System.currentTimeMillis())deliver(context,db,key);
            else {PendingIntent pending=alarm(context,key);try{if(exactAllowed(context))alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,due,pending);else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,due,pending);}catch(SecurityException e){alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,due,pending);}}
        }
        prefs.edit().putString("signature",signature).apply();
    }
    static JSONObject orders(JSONObject home) throws JSONException {
        JSONObject orders=new JSONObject();
        JSONArray rows=home.optJSONArray("calendarRows");if(rows==null)rows=home.optJSONArray("rows");
        if(rows!=null)for(int i=0;i<rows.length();i++){
            JSONObject row=rows.optJSONObject(i);
            if(row!=null&&!row.optString("schedule_id").isEmpty())orders.put(row.optString("schedule_id"),row);
        }
        return orders;
    }
    static void scheduleChanges(Context context,PortalDatabase db)throws Exception{
        Object owner=db.read("owner");if(!(owner instanceof String))return;
        Object snapshot=db.read(owner+":server-home");if(!(snapshot instanceof JSONObject))return;
        JSONObject home=(JSONObject)snapshot;
        if(!owner.equals(home.optString("email")))return;
        SharedPreferences prefs=context.getSharedPreferences("portal-schedule-notifications",Context.MODE_PRIVATE);
        String key="orders:"+owner;JSONObject current=orders(home);
        String saved=prefs.getString(key,null);
        if(saved!=null){
            JSONObject previous=new JSONObject(saved);
            for(int direction=0;direction<2;direction++){
                JSONObject source=direction==0?current:previous,other=direction==0?previous:current;
                java.util.Iterator<String> ids=source.keys();
                while(ids.hasNext()){
                    String id=ids.next();if(other.has(id))continue;
                    JSONObject row=source.getJSONObject(id);
                    String text="OS "+row.optString("number")+" · "+row.optString("customer");
                    JSONObject target=new JSONObject().put("operation_id",direction==0?row.optString("id"):"");
                    Notification notification=new NotificationCompat.Builder(context,SCHEDULE_CHANNEL)
                        .setSmallIcon(R.drawable.ic_notification).setContentTitle(direction==0?"OS incluída na programação":"OS removida da programação")
                        .setContentText(text).setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                        .setContentIntent(open(context,target)).setAutoCancel(true).build();
                    try{NotificationManagerCompat.from(context).notify("schedule:"+id,2103,notification);}catch(SecurityException ignored){}
                }
            }
        }
        prefs.edit().putString(key,current.toString()).apply();
    }
    static synchronized void deliver(Context context,PortalDatabase db,String expected)throws Exception{
        JSONObject home=home(db);String key=alertKey(home);if(key.isEmpty()||!key.equals(expected))return;
        JSONObject active=home.getJSONObject("active");if(deadline(active)>System.currentTimeMillis()){update(context,db,true);return;}
        SharedPreferences prefs=context.getSharedPreferences("portal-notifications",Context.MODE_PRIVATE);
        if(key.equals(prefs.getString("delivered","")))return;
        channels(context);NotificationManagerCompat manager=NotificationManagerCompat.from(context);
        if(!manager.areNotificationsEnabled())return;
        if(Build.VERSION.SDK_INT>=26){NotificationChannel channel=context.getSystemService(NotificationManager.class).getNotificationChannel(PAUSE_CHANNEL);if(channel!=null&&channel.getImportance()==NotificationManager.IMPORTANCE_NONE)return;}
        JSONObject reason=active.optJSONObject("pause_reason");String body=(reason==null?"Pausa":reason.optString("name"))+": limite de "+(reason==null?0:reason.optInt("minutes"))+" minutos atingido. Você ainda está em pausa?";
        Notification alert=new NotificationCompat.Builder(context,PAUSE_CHANNEL).setSmallIcon(R.drawable.ic_notification).setContentTitle("Limite de pausa atingido · "+label(home,active)).setContentText(body).setStyle(new NotificationCompat.BigTextStyle().bigText(body)).setContentIntent(open(context,active)).setAutoCancel(true).setPriority(NotificationCompat.PRIORITY_HIGH).setCategory(NotificationCompat.CATEGORY_REMINDER).setVisibility(NotificationCompat.VISIBILITY_PUBLIC).setDefaults(Notification.DEFAULT_SOUND|Notification.DEFAULT_VIBRATE).build();
        try{manager.notify(PAUSE_ID,alert);prefs.edit().putString("delivered",key).apply();}catch(SecurityException ignored){}
    }
}
