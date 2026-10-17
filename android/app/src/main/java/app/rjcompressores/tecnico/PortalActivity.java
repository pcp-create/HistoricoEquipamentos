package app.rjcompressores.tecnico;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.location.LocationManager;
import android.net.Uri;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.os.Bundle;
import android.provider.MediaStore;
import android.provider.Settings;
import android.text.InputType;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.*;

/** Only packaged UI runs in the WebView. Login and mandatory location gate are Android views. */
public class PortalActivity extends Activity {
    static final String ORIGIN="https://rjcompressores.app";
    private PortalDatabase database;
    private NativeLocation nativeLocation;
    private String pendingOperation;
    private WebView web;
    private FrameLayout root;
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;
    private String pendingExport;
    private boolean resumed=false;
    private boolean gated=false, loginVisible=false, destroyed=false;
    private TextView connection;
    private ConnectivityManager.NetworkCallback networkCallback;
    boolean internetAvailable(){
        ConnectivityManager cm=(ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);
        NetworkCapabilities caps=cm.getNetworkCapabilities(cm.getActiveNetwork());
        return caps!=null&&caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)&&caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }
    private void networkChanged(){runOnUiThread(()->{if(destroyed)return;updateConnection();if(web!=null)web.evaluateJavascript("window.dispatchEvent(new Event('rj-network-change'))",null);});}

    private final BroadcastReceiver locationChanged=new BroadcastReceiver(){
        @Override public void onReceive(Context c,Intent i){checkLocation();updateConnection();}
    };
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(25,57,82));
        getWindow().setNavigationBarColor(Color.rgb(244,247,250));
        database=new PortalDatabase(this);nativeLocation=new NativeLocation(this);pendingOperation=getIntent().getStringExtra("operationId");
        root=new FrameLayout(this);root.setFitsSystemWindows(true);root.setBackgroundColor(Color.rgb(244,247,250));setContentView(root);
        IntentFilter changes=new IntentFilter(LocationManager.PROVIDERS_CHANGED_ACTION);changes.addAction(ConnectivityManager.CONNECTIVITY_ACTION);
        registerReceiver(locationChanged,changes);
        networkCallback=new ConnectivityManager.NetworkCallback(){
            @Override public void onAvailable(android.net.Network n){networkChanged();}
            @Override public void onLost(android.net.Network n){networkChanged();}
            @Override public void onCapabilitiesChanged(android.net.Network n,NetworkCapabilities caps){networkChanged();}
        };
        ((ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE)).registerDefaultNetworkCallback(networkCallback);
        checkLocation();
    }
    private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
    private LinearLayout panel(){
        LinearLayout content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(26),dp(36),dp(26),dp(24));
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.addView(content);
        root.removeAllViews();root.addView(scroll);return content;
    }
    private TextView text(String value,int size){
        TextView t=new TextView(this);t.setText(value);t.setTextSize(size);t.setTextColor(Color.rgb(31,65,93));
        t.setPadding(0,dp(8),0,dp(8));return t;
    }
    private Button button(String label,Runnable action){
        Button b=new Button(this);b.setText(label);b.setAllCaps(false);b.setTextColor(Color.WHITE);b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(36,99,151)));
        b.setOnClickListener(v->action.run());return b;
    }
    private void brand(LinearLayout p){
        ImageView mark=new ImageView(this);mark.setImageResource(R.drawable.portal_tecnico_logo);mark.setContentDescription("Portal Técnico · RJ Compressores");mark.setScaleType(ImageView.ScaleType.CENTER_CROP);
        android.graphics.drawable.GradientDrawable badge=new android.graphics.drawable.GradientDrawable();badge.setColor(Color.rgb(24,62,101));badge.setCornerRadius(dp(28));mark.setBackground(badge);mark.setClipToOutline(true);
        LinearLayout.LayoutParams image=new LinearLayout.LayoutParams(dp(132),dp(132));image.gravity=Gravity.CENTER_HORIZONTAL;image.bottomMargin=dp(16);p.addView(mark,image);
        TextView title=text("Portal Técnico RJ",26);title.setTypeface(null,android.graphics.Typeface.BOLD);title.setGravity(Gravity.CENTER);p.addView(title);
        TextView subtitle=text("SERVIÇO EM CAMPO",11);subtitle.setLetterSpacing(.16f);subtitle.setGravity(Gravity.CENTER);p.addView(subtitle);
    }
    private void showMessage(String title,String message){LinearLayout p=panel();brand(p);p.addView(text(title,22));p.addView(text(message,16));}
    boolean locationReady(){
        LocationManager lm=(LocationManager)getSystemService(LOCATION_SERVICE);
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED &&
            (lm.isProviderEnabled(LocationManager.GPS_PROVIDER)||lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER));
    }
    private void checkLocation(){
        if(root==null||destroyed)return;
        if(!locationReady()){
            gated=true;LinearLayout p=panel();brand(p);p.addView(text("Ative a localização para continuar",23));
            p.addView(text("O Portal Técnico RJ utiliza a localização nos apontamentos. Autorize a localização precisa e mantenha a localização do aparelho ligada durante o uso. Seus registros salvos permanecem no dispositivo.",16));
            p.addView(button("Liberar acessos necessários",this::requestAccess));
            p.addView(button("Ativar localização",()->startActivity(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))));
            p.addView(button("Permissões do aplicativo",()->startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getPackageName())))));
            p.addView(button("Continuar",this::checkLocation));return;
        }
        if(gated||root.getChildCount()==0){gated=false;if(web!=null&&!loginVisible)showWeb();else restoreAccount();}
    }
    private void restoreAccount(){
        LinearLayout loading=panel();brand(loading);loading.addView(new ProgressBar(this));loading.addView(text("Abrindo seus registros locais…",16));
        io.execute(()->{try{boolean signed=database.read("owner") instanceof String;runOnUiThread(()->{if(gated||destroyed)return;if(signed)showWeb();else showLogin();});}catch(Exception e){runOnUiThread(()->showMessage("Armazenamento indisponível","Não foi possível abrir os registros locais. Não limpe os dados do aplicativo; solicite suporte."));}});
    }
    private void updateConnection(){
        if(connection==null)return;
        boolean online=internetAvailable();
        connection.setText(online?"Conectado":"Sem internet");
        connection.setCompoundDrawablesWithIntrinsicBounds(online?R.drawable.ic_wifi:R.drawable.ic_wifi_off,0,0,0);
        connection.setCompoundDrawablePadding(dp(7));
        connection.setTextColor(online?Color.rgb(24,117,67):Color.rgb(180,35,24));
        android.graphics.drawable.GradientDrawable band=new android.graphics.drawable.GradientDrawable();band.setColor(online?Color.rgb(229,245,235):Color.rgb(253,233,232));band.setCornerRadius(0);connection.setBackground(band);
        connection.setPadding(dp(12),dp(10),dp(12),dp(10));
    }
    private void updatePresenceService(){
        try{boolean enabled=PortalLocationService.eligible(PortalNotifications.home(database));
            runOnUiThread(()->{if(destroyed)return;Intent intent=new Intent(this,PortalLocationService.class);if(!enabled){stopService(intent);return;}if(resumed&&locationReady())try{androidx.core.content.ContextCompat.startForegroundService(this,intent);}catch(IllegalStateException|SecurityException ignored){}});
        }catch(Exception ignored){}
    }
    private void openPdf(String url,String id,androidx.webkit.JavaScriptReplyProxy reply){
        if(!url.startsWith("/api/field/report?")||!"/api/field/report".equals(Uri.parse(url).getPath()))return;
        String cookie=CookieManager.getInstance().getCookie(ORIGIN);
        new Thread(()->{JSONObject result=new JSONObject();HttpURLConnection request=null;try{
            result.put("id",id);request=(HttpURLConnection)new URL(ORIGIN+url).openConnection();request.setConnectTimeout(15000);request.setReadTimeout(60000);request.setInstanceFollowRedirects(false);if(cookie!=null)request.setRequestProperty("Cookie",cookie);
            if(request.getResponseCode()!=200){String message="Não foi possível gerar o PDF.";try{message=new JSONObject(readStream(request.getErrorStream())).optString("error",message);}catch(Exception ignored){}throw new IOException(message);}
            for(Map.Entry<String,List<String>> header:request.getHeaderFields().entrySet())if("Set-Cookie".equalsIgnoreCase(header.getKey()))for(String value:header.getValue())CookieManager.getInstance().setCookie(ORIGIN,value);
            CookieManager.getInstance().flush();
            if(!String.valueOf(request.getContentType()).contains("application/pdf"))throw new IOException("O servidor não retornou um relatório PDF.");
            File directory=new File(getCacheDir(),"reports");directory.mkdirs();File file=File.createTempFile("relatorio-",".pdf",directory);
            try(InputStream input=request.getInputStream();OutputStream output=new FileOutputStream(file)){byte[] chunk=new byte[16384];int count;long size=0;while((count=input.read(chunk))!=-1){size+=count;if(size>100*1024*1024)throw new IOException("Relatório muito grande para visualizar.");output.write(chunk,0,count);}}
            result.put("value",JSONObject.NULL);runOnUiThread(()->{if(!destroyed)startActivity(new Intent(this,PortalPdfActivity.class).putExtra("file",file.getAbsolutePath()));});
        }catch(Exception e){try{result.put("error",e instanceof IOException?e.getMessage():"Não foi possível abrir o PDF.");}catch(Exception ignored){}}finally{if(request!=null)request.disconnect();runOnUiThread(()->{if(!destroyed)reply.postMessage(result.toString());});}},"portal-pdf").start();
    }
    private void styleInput(EditText input){
        android.graphics.drawable.GradientDrawable bg=new android.graphics.drawable.GradientDrawable();bg.setColor(Color.WHITE);bg.setCornerRadius(dp(12));bg.setStroke(dp(1),Color.rgb(214,226,237));input.setBackground(bg);input.setTextSize(16);input.setPadding(dp(14),dp(12),dp(14),dp(12));
        LinearLayout.LayoutParams params=new LinearLayout.LayoutParams(-1,dp(52));params.bottomMargin=dp(8);input.setLayoutParams(params);
    }
    private void showLogin(){
        if(!locationReady()){checkLocation();return;}
        if(web!=null){web.destroy();web=null;}
        loginVisible=true;LinearLayout p=panel();
        connection=text("",13);LinearLayout.LayoutParams band=new LinearLayout.LayoutParams(-1,-2);band.setMargins(-dp(26),-dp(36),-dp(26),dp(28));p.addView(connection,band);updateConnection();brand(p);
        p.addView(text("Sua programação e seus relatórios, também offline.",16));

        p.addView(text("E-mail",14));EditText email=new EditText(this);email.setSingleLine(true);email.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);email.setHint("Seu e-mail");p.addView(email);styleInput(email);
        p.addView(text("Senha",14));EditText password=new EditText(this);password.setSingleLine(true);password.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);password.setHint("Sua senha");p.addView(password);styleInput(password);
        CheckBox remember=new CheckBox(this);remember.setText("Lembrar-me");remember.setTextColor(Color.rgb(31,65,93));remember.setPadding(0,dp(8),0,dp(8));p.addView(remember);
        String[] stored=RememberedLogin.read(this);if(stored!=null){email.setText(stored[0]);password.setText(stored[1]);remember.setChecked(true);}
        remember.setOnCheckedChangeListener((v,checked)->{if(!checked)RememberedLogin.clear(this);});
        TextView error=text("",14);error.setTextColor(Color.rgb(180,35,24));p.addView(error);
        Button enter=button("Entrar",()->{});p.addView(enter);
        enter.setOnClickListener(v->{
            if(!locationReady()){checkLocation();return;}
            if(email.getText().toString().trim().isEmpty()||password.length()==0){error.setText("Informe seu e-mail e senha.");return;}
            enter.setEnabled(false);enter.setText("Entrando…");error.setText("");
            String account=email.getText().toString().trim(),secret=password.getText().toString();boolean saveLogin=remember.isChecked();
            io.execute(()->{try{
                JSONObject body=new JSONObject().put("email",account).put("password",secret);
                HttpURLConnection c=(HttpURLConnection)new URL(ORIGIN+"/api/session").openConnection();
                c.setConnectTimeout(15000);c.setReadTimeout(15000);c.setInstanceFollowRedirects(false);c.setRequestMethod("POST");c.setDoOutput(true);
                c.setRequestProperty("Content-Type","application/json");c.setRequestProperty("Origin",ORIGIN);
                try(OutputStream output=c.getOutputStream()){output.write(body.toString().getBytes(StandardCharsets.UTF_8));}
                int code=c.getResponseCode();String response=readStream(code<400?c.getInputStream():c.getErrorStream());
                if(code!=200){String message="Servidor indisponível. Tente novamente quando a conexão com o sistema for restabelecida.";try{message=new JSONObject(response).optString("error",message);}catch(Exception ignored){}c.disconnect();throw new IOException(message);}
                for(Map.Entry<String,List<String>> header:c.getHeaderFields().entrySet())if("Set-Cookie".equalsIgnoreCase(header.getKey()))for(String cookie:header.getValue())CookieManager.getInstance().setCookie(ORIGIN,cookie);
                CookieManager.getInstance().flush();c.disconnect();
                try{if(saveLogin)RememberedLogin.save(this,account,secret);else RememberedLogin.clear(this);}catch(Exception ignored){RememberedLogin.clear(this);runOnUiThread(()->Toast.makeText(this,"Login realizado, mas não foi possível lembrar a senha neste aparelho.",Toast.LENGTH_LONG).show());}
                runOnUiThread(()->{if(destroyed)return;password.setText("");loginVisible=false;if(web!=null){web.destroy();web=null;}if(locationReady())showWeb();else checkLocation();});
            }catch(Exception e){runOnUiThread(()->{if(destroyed)return;error.setText(e instanceof IOException?"Não foi possível entrar. "+e.getMessage():"Não foi possível entrar. Verifique a conexão.");enter.setEnabled(true);enter.setText("Entrar");});}});
        });
        p.addView(button("Permissões do aplicativo",this::showPermissions));
        p.addView(text("Use sua conta cadastrada. Após baixar a programação, os registros ficam salvos neste aparelho até a sincronização.",14));
        try{p.addView(new View(this),new LinearLayout.LayoutParams(-1,0,1f));TextView version=text("Versão "+getPackageManager().getPackageInfo(getPackageName(),0).versionName,12);version.setGravity(Gravity.CENTER);p.addView(version);}catch(android.content.pm.PackageManager.NameNotFoundException ignored){}
    }
    private static String readStream(InputStream in)throws IOException{
        if(in==null)return "";try(InputStream source=in;ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] b=new byte[8192];int n;while((n=source.read(b))!=-1)out.write(b,0,n);return out.toString("UTF-8");}
    }
    private void showWeb(){
        if(destroyed||!locationReady()){checkLocation();return;}loginVisible=false;
        if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){
            showMessage("Atualize o Android System WebView", "Atualize o componente na Play Store para utilizar o Portal Técnico RJ.");return;
        }
        if(web==null){
            web=new WebView(this);WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
            settings.setAllowFileAccess(false);settings.setAllowContentAccess(true);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            settings.setJavaScriptCanOpenWindowsAutomatically(false);settings.setGeolocationEnabled(true);
            CookieManager.getInstance().setAcceptCookie(true);CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
            WebViewCompat.addWebMessageListener(web,"RJDatabase",Collections.singleton(ORIGIN),(view,message,origin,mainFrame,reply)->{
                if(!mainFrame||!trustedOrigin(origin))return;
                try{
                    JSONObject call=new JSONObject(message.getData());String action=call.optString("action"),id=call.getString("id");
                    if(action.equals("openPdf")){openPdf(call.getString("url"),id,reply);return;}
                    if(action.equals("network")){reply.postMessage(new JSONObject().put("id",id).put("value",internetAvailable()).toString());return;}
                    if(action.equals("location")){
                        nativeLocation.request(call.optLong("maximumAge",30000),call.optLong("timeout",30000),(position,error,code)->{
                            try{JSONObject result=new JSONObject().put("id",id);if(error==null)result.put("value",position);else result.put("error",error).put("errorCode",code);if(!destroyed)reply.postMessage(result.toString());}catch(Exception ignored){}
                        });return;
                    }
                    if(action.equals("permissions")){showPermissions();reply.postMessage(new JSONObject().put("id",id).put("value",JSONObject.NULL).toString());return;}
                    if(action.equals("launchOperation")){reply.postMessage(new JSONObject().put("id",id).put("value",pendingOperation==null?JSONObject.NULL:pendingOperation).toString());pendingOperation=null;return;}
                }catch(Exception ignored){return;}
                io.execute(()->{JSONObject result=new JSONObject();try{
                    JSONObject call=new JSONObject(message.getData());result.put("id",call.getString("id"));
                    String action=call.getString("action");Object value=JSONObject.NULL;
                    if(action.equals("read"))value=database.read(call.getString("key"));
                    else if(action.equals("write")){database.write(call.getJSONArray("entries"));updatePresenceService();try{PortalNotifications.update(this,database,false);}catch(Exception e){android.util.Log.w("PortalNotifications","Aviso indisponível; registro salvo",e);}}
                    else if(action.equals("export")){pendingExport=call.getString("data");runOnUiThread(()->{Intent save=new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,"portal-tecnico-pendencias.json");startActivityForResult(save,103);});}
                    else throw new IllegalArgumentException("Ação inválida");
                    result.put("value",value);
                }catch(Exception e){try{result.put("error","Não foi possível acessar o banco local. Preserve os dados e tente novamente.");}catch(Exception ignored){}}
                runOnUiThread(()->{if(!destroyed)reply.postMessage(result.toString());});});
            });
            web.setWebViewClient(new WebViewClient(){
                @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
                    Uri u=request.getUrl();String path=u.getPath();
                    if(!"https".equals(u.getScheme()))return blocked();
                    if(!"rjcompressores.app".equals(u.getHost()))return request.isForMainFrame()?blocked():null;
                    if(path.equals("/tecnico")||path.equals("/native/index.html"))return asset("index.html","text/html");
                    if(path.startsWith("/native/"))return asset(path.substring(8),mime(path));
                    if(path.startsWith("/api/service-scheduling/photos/"))try{
                        String id=u.getLastPathSegment();byte[] saved=database.photo(id);
                        if(saved!=null)return new WebResourceResponse(database.photoType(id),null,new ByteArrayInputStream(saved));
                        if(id.startsWith("local-"))return blocked();
                    }catch(Exception ignored){return blocked();}
                    if(request.isForMainFrame())return blocked();
                    if(path.startsWith("/api/"))return null;
                    return blocked();
                }
                @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                    Uri u=request.getUrl();
                    if(ORIGIN.equals(u.getScheme()+"://"+u.getHost())&&"/tecnico/entrar".equals(u.getPath())){showLogin();return true;}
                    if(ORIGIN.equals(u.getScheme()+"://"+u.getHost())&&"/tecnico".equals(u.getPath()))return false;
                    if("https".equals(u.getScheme())||"tel".equals(u.getScheme())||"geo".equals(u.getScheme()))try{startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception ignored){}
                    return true;
                }
                @Override public void onReceivedSslError(WebView v,android.webkit.SslErrorHandler h,android.net.http.SslError e){h.cancel();}
            });
            web.setWebChromeClient(new WebChromeClient(){
                @Override public void onGeolocationPermissionsShowPrompt(String origin,GeolocationPermissions.Callback callback){callback.invoke(origin,trustedOrigin(Uri.parse(origin))&&locationReady(),false);if(!locationReady())checkLocation();}
                @Override public boolean onJsAlert(WebView view,String url,String message,JsResult result){new AlertDialog.Builder(PortalActivity.this).setTitle("Portal Técnico RJ").setMessage(message).setPositiveButton("Entendi",(d,w)->result.confirm()).setOnCancelListener(d->result.cancel()).show();return true;}
                @Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> callback,FileChooserParams params){
                    if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=callback;
                    Intent pick=new Intent(Intent.ACTION_GET_CONTENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_ALLOW_MULTIPLE,params.getMode()==FileChooserParams.MODE_OPEN_MULTIPLE);
                    Intent chooser=Intent.createChooser(pick,"Adicionar fotos");cameraUri=null;
                    try{File dir=new File(getCacheDir(),"camera");dir.mkdirs();File photo=File.createTempFile("foto-",".jpg",dir);cameraUri=FileProvider.getUriForFile(PortalActivity.this,getPackageName()+".files",photo);
                        Intent camera=new Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT,cameraUri).addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        camera.setClipData(ClipData.newRawUri("foto",cameraUri));chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS,new Intent[]{camera});
                    }catch(Exception ignored){}
                    try{startActivityForResult(chooser,102);}catch(Exception e){fileCallback.onReceiveValue(null);fileCallback=null;}return true;
                }
            });
            web.loadUrl(ORIGIN+"/tecnico");
        }
        if(web.getParent() instanceof ViewGroup)((ViewGroup)web.getParent()).removeView(web);
        root.removeAllViews();root.addView(web);
    }
    static boolean trustedOrigin(Uri uri){return "https".equals(uri.getScheme())&&"rjcompressores.app".equals(uri.getHost())&&(uri.getPort()==-1||uri.getPort()==443);}
    private void requestAccess(){
        ArrayList<String> needed=new ArrayList<>();
        if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){needed.add(Manifest.permission.ACCESS_FINE_LOCATION);needed.add(Manifest.permission.ACCESS_COARSE_LOCATION);}
        if(android.os.Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)needed.add(Manifest.permission.POST_NOTIFICATIONS);
        if(!needed.isEmpty()){requestPermissions(needed.toArray(new String[0]),101);return;}
        if(!locationReady()){startActivity(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS));return;}
        if(!androidx.core.app.NotificationManagerCompat.from(this).areNotificationsEnabled()){startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getPackageName())));return;}
        if(!PortalNotifications.exactAllowed(this)){startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,Uri.parse("package:"+getPackageName())));return;}
        showPermissions();
    }
    private void permissionRow(LinearLayout parent,String title,String description,boolean enabled){
        LinearLayout card=new LinearLayout(this);card.setOrientation(LinearLayout.VERTICAL);card.setPadding(dp(12),dp(6),dp(12),dp(6));
        android.graphics.drawable.GradientDrawable background=new android.graphics.drawable.GradientDrawable();background.setColor(enabled?Color.rgb(235,246,240):Color.rgb(255,247,228));background.setCornerRadius(dp(12));card.setBackground(background);
        TextView name=text(title+" · "+(enabled?"Ativo":"Pendente"),15);name.setTypeface(null,android.graphics.Typeface.BOLD);card.addView(name);card.addView(text(description,12));LinearLayout.LayoutParams margins=new LinearLayout.LayoutParams(-1,-2);margins.bottomMargin=dp(10);parent.addView(card,margins);
    }
    private void showPermissions(){
        LinearLayout content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(dp(20),dp(8),dp(20),dp(8));
        permissionRow(content,"Localização precisa","Necessária para registrar os apontamentos.",checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED);
        LocationManager lm=(LocationManager)getSystemService(LOCATION_SERVICE);
        permissionRow(content,"Localização do aparelho","Mantenha o GPS ligado para obter sua posição.",lm.isProviderEnabled(LocationManager.GPS_PROVIDER)||lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER));
        permissionRow(content,"Notificações","Atividade em andamento e avisos de pausa.",androidx.core.app.NotificationManagerCompat.from(this).areNotificationsEnabled());
        permissionRow(content,"Alarmes de pausa","Permite avisar no horário do limite configurado.",PortalNotifications.exactAllowed(this));
        content.addView(text("A localização continua ativa com o aplicativo minimizado. Ao fechar pelo botão Fechar ou remover da lista de aplicativos recentes, o envio é interrompido.",13));
        ScrollView scroll=new ScrollView(this);scroll.addView(content);
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle("Permissões do aplicativo").setView(scroll).setPositiveButton("Fechar",null).create();
        content.addView(button("Liberar acessos necessários",()->{dialog.dismiss();requestAccess();}));
        content.addView(button("Configurações do aplicativo",()->startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getPackageName())))));
        content.addView(button("Ativar localização",()->startActivity(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS))));
        TextView gps=text("",14);content.addView(gps);
        content.addView(button("Testar localização",()->{gps.setText("Obtendo posição do aparelho…");nativeLocation.request(30000,45000,(position,error,code)->gps.setText(error==null?"Localização obtida com sucesso.":error));}));
        dialog.show();
    }
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);pendingOperation=intent.getStringExtra("operationId");if(web!=null)web.evaluateJavascript("window.dispatchEvent(new Event('rj-open-operation'))",null);}
    private WebResourceResponse asset(String name,String mime){
        if(name.contains(".."))return blocked();
        try{Map<String,String> headers=new HashMap<>();headers.put("Cache-Control","no-store");headers.put("Content-Security-Policy","default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://tile.openstreetmap.org; connect-src 'self'; font-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'");
            return new WebResourceResponse(mime,"UTF-8",200,"OK",headers,getAssets().open(name));
        }catch(IOException e){return blocked();}
    }
    private static String mime(String path){if(path.endsWith(".js"))return "text/javascript";if(path.endsWith(".css"))return "text/css";if(path.endsWith(".woff2"))return "font/woff2";if(path.endsWith(".woff"))return "font/woff";if(path.endsWith(".png"))return "image/png";if(path.endsWith(".svg"))return "image/svg+xml";return "application/octet-stream";}
    private static WebResourceResponse blocked(){return new WebResourceResponse("text/plain","UTF-8",403,"Forbidden",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
    @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);
        if(request==102&&fileCallback!=null){Uri[] values=null;if(result==RESULT_OK){if(data!=null&&data.getClipData()!=null){ClipData clip=data.getClipData();values=new Uri[clip.getItemCount()];for(int i=0;i<values.length;i++)values[i]=clip.getItemAt(i).getUri();}else if(data!=null&&data.getData()!=null)values=new Uri[]{data.getData()};else if(cameraUri!=null)values=new Uri[]{cameraUri};}fileCallback.onReceiveValue(values);fileCallback=null;cameraUri=null;}
        if(request==103&&result==RESULT_OK&&data!=null&&data.getData()!=null&&pendingExport!=null){String export=pendingExport;Uri uri=data.getData();io.execute(()->{try(OutputStream out=getContentResolver().openOutputStream(uri)){out.write(export.getBytes(StandardCharsets.UTF_8));}catch(Exception e){runOnUiThread(()->Toast.makeText(this,"Não foi possível exportar as pendências.",Toast.LENGTH_LONG).show());}});}if(request==103)pendingExport=null;
    }
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results){super.onRequestPermissionsResult(request,permissions,results);checkLocation();if(request==101)showPermissions();}
    @Override protected void onResume(){super.onResume();resumed=true;if(root!=null)checkLocation();if(web!=null)web.onResume();networkChanged();if(database!=null)io.execute(()->{updatePresenceService();try{PortalNotifications.update(this,database,true);}catch(Exception ignored){}});}
    @Override protected void onPause(){resumed=false;if(web!=null)web.onPause();super.onPause();}
    @Override public void onBackPressed(){if(web!=null&&!loginVisible&&!gated){new AlertDialog.Builder(this).setTitle("Fechar Portal Técnico RJ?").setMessage("Os registros salvos permanecem no aparelho. A sincronização continuará quando você retornar ao aplicativo.").setPositiveButton("Fechar",(d,w)->finish()).setNegativeButton("Continuar",null).show();}else super.onBackPressed();}
    @Override protected void onDestroy(){if(isFinishing())stopService(new Intent(this,PortalLocationService.class));destroyed=true;if(networkCallback!=null)((ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE)).unregisterNetworkCallback(networkCallback);if(nativeLocation!=null)nativeLocation.close();try{unregisterReceiver(locationChanged);}catch(Exception ignored){}if(fileCallback!=null)fileCallback.onReceiveValue(null);if(web!=null)web.destroy();io.execute(()->database.close());io.shutdown();super.onDestroy();}
}
