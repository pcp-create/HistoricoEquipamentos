package app.rjcompressores.tecnico;

import android.app.Activity;
import android.app.AlertDialog;
import android.text.InputType;
import android.view.WindowManager;
import android.widget.EditText;
import android.widget.LinearLayout;
import java.util.function.Consumer;

/** Native dialogs for actions initiated by the packaged portal interface. */
final class PortalDialogs {
    static AlertDialog prompt(Activity activity, String message, String value, Consumer<String> confirm, Runnable cancel) {
        int padding = Math.round(24 * activity.getResources().getDisplayMetrics().density);
        LinearLayout content = new LinearLayout(activity);
        content.setPadding(padding, padding / 2, padding, 0);
        EditText input = new EditText(activity);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        input.setMinLines(2);
        input.setMaxLines(5);
        input.setGravity(android.view.Gravity.TOP);
        input.setHint("Digite o motivo");
        input.setContentDescription(message);
        input.setText(value == null ? "" : value);
        content.addView(input, new LinearLayout.LayoutParams(-1, -2));
        AlertDialog dialog = new AlertDialog.Builder(activity)
            .setTitle("Portal Técnico RJ").setMessage(message).setView(content)
            .setPositiveButton("Confirmar", (d, which) -> confirm.accept(input.getText().toString()))
            .setNegativeButton("Cancelar", (d, which) -> cancel.run())
            .setOnCancelListener(d -> cancel.run()).create();
        dialog.setOnShowListener(d -> {
            input.requestFocus();
            dialog.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE | WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        });
        dialog.show();
        return dialog;
    }

    static AlertDialog confirm(Activity activity, String message, Runnable confirm, Runnable cancel) {
        return new AlertDialog.Builder(activity).setTitle("Portal Técnico RJ").setMessage(message)
            .setPositiveButton("Confirmar", (d, which) -> confirm.run())
            .setNegativeButton("Cancelar", (d, which) -> cancel.run())
            .setOnCancelListener(d -> cancel.run()).show();
    }
}
