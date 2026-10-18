package app.rjcompressores.tecnico;

import static org.junit.Assert.*;
import android.app.Activity;
import android.app.AlertDialog;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(RobolectricTestRunner.class) @Config(sdk=28)
public class PortalDialogsTest {
    private EditText input(View view) {
        if(view instanceof EditText)return (EditText)view;
        if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++){
            EditText found=input(((ViewGroup)view).getChildAt(i));if(found!=null)return found;
        }
        return null;
    }
    @Test public void nativePromptReturnsReasonAndCancellationDoesNotSubmit(){
        try(org.robolectric.android.controller.ActivityController<Activity> controller=Robolectric.buildActivity(Activity.class).setup()){
            AtomicReference<String> answer=new AtomicReference<>();AtomicInteger cancelled=new AtomicInteger();
            String message="Informe o motivo da devolução do checklist";
            AlertDialog dialog=PortalDialogs.prompt(controller.get(),message,"",answer::set,cancelled::incrementAndGet);
            assertEquals("Portal Técnico RJ",Shadows.shadowOf(dialog).getTitle().toString());
            assertEquals(message,Shadows.shadowOf(dialog).getMessage().toString());
            input(dialog.getWindow().getDecorView()).setText("Checklist incorreto\nFavor revisar");
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).performClick();org.robolectric.shadows.ShadowLooper.idleMainLooper();
            assertEquals("Checklist incorreto\nFavor revisar",answer.get());assertEquals(0,cancelled.get());
            dialog=PortalDialogs.prompt(controller.get(),message,"",answer::set,cancelled::incrementAndGet);
            dialog.cancel();org.robolectric.shadows.ShadowLooper.idleMainLooper();assertEquals(1,cancelled.get());
            assertEquals("Checklist incorreto\nFavor revisar",answer.get());
        }
    }
    @Test public void confirmationUsesNativeTitleAndHonorsCancel(){
        try(org.robolectric.android.controller.ActivityController<Activity> controller=Robolectric.buildActivity(Activity.class).setup()){
            AtomicInteger confirmed=new AtomicInteger(),cancelled=new AtomicInteger();
            AlertDialog dialog=PortalDialogs.confirm(controller.get(),"Devolver ao planejamento?",confirmed::incrementAndGet,cancelled::incrementAndGet);
            assertEquals("Portal Técnico RJ",Shadows.shadowOf(dialog).getTitle().toString());
            dialog.getButton(AlertDialog.BUTTON_NEGATIVE).performClick();org.robolectric.shadows.ShadowLooper.idleMainLooper();
            assertEquals(0,confirmed.get());assertEquals(1,cancelled.get());
        }
    }
}
