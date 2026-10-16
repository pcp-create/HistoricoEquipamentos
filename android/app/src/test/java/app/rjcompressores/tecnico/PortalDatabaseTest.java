package app.rjcompressores.tecnico;
import static org.junit.Assert.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.json.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=28)
public class PortalDatabaseTest {
    @Test public void savesLargePhotosAndPendingQueueAcrossReopening() throws Exception {
        PortalDatabase db=new PortalDatabase(RuntimeEnvironment.getApplication());
        String large=new String(new char[3*1024*1024]).replace('\0','x');
        JSONArray queue=new JSONArray().put(new JSONObject().put("id","request-1"));
        db.write(new JSONArray().put(new JSONArray().put("owner").put("tech-a")).put(new JSONArray().put("blob:large").put(large)).put(new JSONArray().put("tech-a:queue").put(queue)));
        db.close();db=new PortalDatabase(RuntimeEnvironment.getApplication());
        assertEquals(large,db.read("blob:large"));
        assertEquals("request-1",((JSONArray)db.read("tech-a:queue")).getJSONObject(0).getString("id"));
        db.write(new JSONArray().put(new JSONArray().put("owner").put(JSONObject.NULL)));
        assertEquals(JSONObject.NULL,db.read("owner"));
        assertEquals(1,((JSONArray)db.read("tech-a:queue")).length());db.close();
    }
    @Test public void rollsBackEntireBatchOnInvalidWrite() throws Exception {
        PortalDatabase db=new PortalDatabase(RuntimeEnvironment.getApplication());
        db.write(new JSONArray().put(new JSONArray().put("owner").put("original")));
        try {
            db.write(new JSONArray().put(new JSONArray().put("owner").put("changed")).put("invalid-row"));
            fail("Expected malformed batch to fail");
        } catch(JSONException expected) {}
        assertEquals("original",db.read("owner"));db.close();
    }
    @Test public void doesNotExposeAnotherAccountsPhoto() throws Exception {
        PortalDatabase db=new PortalDatabase(RuntimeEnvironment.getApplication());
        JSONObject photo=new JSONObject().put("file",new JSONObject().put("__rjBlob","example").put("type","image/png"));
        db.write(new JSONArray().put(new JSONArray().put("owner").put("tech-a")).put(new JSONArray().put("blob:example").put("aGVsbG8=")).put(new JSONArray().put("tech-a:photo:local-1").put(photo)));
        assertArrayEquals("hello".getBytes(),db.photo("local-1"));
        db.write(new JSONArray().put(new JSONArray().put("owner").put("tech-b")));
        assertNull(db.photo("local-1"));db.close();
    }
}
