package app.rjcompressores.tecnico;
import android.content.Context;
import android.security.keystore.*;
import android.util.Base64;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import java.security.KeyStore;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;

/** Opt-in credentials, encrypted with a non-exportable Android Keystore key. */
final class RememberedLogin {
    private static final String ALIAS="portal-remembered-login";
    private static javax.crypto.SecretKey key()throws Exception{
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        if(store.containsAlias(ALIAS))return (javax.crypto.SecretKey)store.getKey(ALIAS,null);
        KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }
    static void save(Context c,String email,String password)throws Exception{
        Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key());
        String data=Base64.encodeToString(cipher.doFinal(new JSONArray().put(email).put(password).toString().getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP);
        c.getSharedPreferences(ALIAS,0).edit().putString("data",data).putString("iv",Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)).commit();
    }
    static String[] read(Context c){
        try{android.content.SharedPreferences prefs=c.getSharedPreferences(ALIAS,0);String data=prefs.getString("data",null);if(data==null)return null;
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(prefs.getString("iv",""),Base64.NO_WRAP)));
            JSONArray value=new JSONArray(new String(cipher.doFinal(Base64.decode(data,Base64.NO_WRAP)),StandardCharsets.UTF_8));return new String[]{value.getString(0),value.getString(1)};
        }catch(Exception e){clear(c);return null;}
    }
    static void clear(Context c){c.getSharedPreferences(ALIAS,0).edit().clear().commit();}
}
