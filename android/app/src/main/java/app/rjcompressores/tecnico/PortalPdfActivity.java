package app.rjcompressores.tecnico;
import android.app.Activity;
import android.os.*;
import android.graphics.*;
import android.graphics.pdf.PdfRenderer;
import android.widget.*;
import java.io.*;
/** Native PDF preview, independent of installed PDF viewers or browser login. */
public final class PortalPdfActivity extends Activity {
    private PdfRenderer pdf;private ParcelFileDescriptor descriptor;private int page=0;private ImageView image;private TextView label;private Button previous,next;private Bitmap bitmap;
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        try{
            File file=new File(getIntent().getStringExtra("file"));
            if(!file.getCanonicalPath().startsWith(new File(getCacheDir(),"reports").getCanonicalPath()+File.separator))throw new IOException();
            descriptor=ParcelFileDescriptor.open(file,ParcelFileDescriptor.MODE_READ_ONLY);pdf=new PdfRenderer(descriptor);
            LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Color.rgb(244,247,250));root.setFitsSystemWindows(true);
            LinearLayout toolbar=new LinearLayout(this);Button back=new Button(this);back.setText("Voltar");back.setOnClickListener(v->finish());toolbar.addView(back);label=new TextView(this);label.setTextColor(Color.rgb(31,65,93));label.setTextSize(16);toolbar.addView(label);root.addView(toolbar);
            ScrollView scroll=new ScrollView(this);image=new ImageView(this);image.setAdjustViewBounds(true);image.setContentDescription("Página do relatório PDF");scroll.addView(image);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
            LinearLayout navigation=new LinearLayout(this);previous=new Button(this);previous.setText("Anterior");previous.setOnClickListener(v->{page--;render();});next=new Button(this);next.setText("Próxima");next.setOnClickListener(v->{page++;render();});navigation.addView(previous,new LinearLayout.LayoutParams(0,-2,1));navigation.addView(next,new LinearLayout.LayoutParams(0,-2,1));root.addView(navigation);setContentView(root);render();
        }catch(Exception e){Toast.makeText(this,"Não foi possível abrir o PDF.",Toast.LENGTH_LONG).show();finish();}
    }
    private void render(){
        try(PdfRenderer.Page current=pdf.openPage(page)){
            int width=Math.min(1600,getResources().getDisplayMetrics().widthPixels*2);
            int height=Math.max(1,(int)((long)width*current.getHeight()/current.getWidth()));
            if(height>4000){width=width*4000/height;height=4000;}
            Bitmap fresh=Bitmap.createBitmap(width,height,Bitmap.Config.ARGB_8888);fresh.eraseColor(Color.WHITE);current.render(fresh,null,null,PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
            image.setImageBitmap(fresh);if(bitmap!=null)bitmap.recycle();bitmap=fresh;
            label.setText("Relatório · "+(page+1)+"/"+pdf.getPageCount());previous.setEnabled(page>0);next.setEnabled(page+1<pdf.getPageCount());
        }
    }
    @Override protected void onDestroy(){if(pdf!=null)pdf.close();try{if(descriptor!=null)descriptor.close();}catch(IOException ignored){}if(bitmap!=null)bitmap.recycle();super.onDestroy();}
}
