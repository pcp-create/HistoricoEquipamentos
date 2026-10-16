package app.rjcompressores.tecnico;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import org.json.JSONArray;
import org.json.JSONObject;
import org.json.JSONTokener;

/** Private app storage. Chunked rows avoid Android's CursorWindow size limit on photos. */
public final class PortalDatabase extends SQLiteOpenHelper {
    public PortalDatabase(Context context) { super(context, "portal-tecnico.db", null, 1); }
    @Override public void onConfigure(SQLiteDatabase db) { db.execSQL("PRAGMA synchronous=FULL"); }
    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE records (key TEXT NOT NULL, part INTEGER NOT NULL, value TEXT NOT NULL, PRIMARY KEY(key,part))");
    }
    @Override public void onUpgrade(SQLiteDatabase db,int oldVersion,int newVersion) {
        throw new IllegalStateException("Unsupported database upgrade; do not erase pending work");
    }
    public synchronized Object read(String key) throws Exception {
        StringBuilder value = new StringBuilder();
        try(Cursor c=getReadableDatabase().rawQuery("SELECT value FROM records WHERE key=? ORDER BY part",new String[]{key})) {
            while(c.moveToNext()) value.append(c.getString(0));
        }
        return value.length()==0 ? JSONObject.NULL : new JSONTokener(value.toString()).nextValue();
    }
    public synchronized void write(JSONArray entries) throws Exception {
        SQLiteDatabase db=getWritableDatabase();db.beginTransaction();
        try {
            for(int i=0;i<entries.length();i++) {
                JSONArray item=entries.getJSONArray(i);String key=item.getString(0);
                db.delete("records","key=?",new String[]{key});
                if(item.isNull(1)) continue;
                String wrapped=new JSONArray().put(item.get(1)).toString();
                String value=wrapped.substring(1,wrapped.length()-1);
                for(int offset=0,part=0;offset<value.length();offset+=65536,part++)
                    db.execSQL("INSERT INTO records(key,part,value) VALUES(?,?,?)",new Object[]{key,part,value.substring(offset,Math.min(value.length(),offset+65536))});
            }
            db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
    }
    public synchronized byte[] photo(String id) throws Exception {
        Object owner=read("owner");if(!(owner instanceof String)) return null;
        Object saved=read(owner+":photo:"+id);if(!(saved instanceof JSONObject)) return null;
        JSONObject file=((JSONObject)saved).optJSONObject("file");if(file==null)return null;
        Object encoded=read("blob:"+file.getString("__rjBlob"));
        return encoded instanceof String?android.util.Base64.decode((String)encoded,android.util.Base64.DEFAULT):null;
    }
    public synchronized String photoType(String id) throws Exception {
        Object saved=read(read("owner")+":photo:"+id);
        return saved instanceof JSONObject?((JSONObject)saved).getJSONObject("file").optString("type","image/jpeg"):"image/jpeg";
    }
}
