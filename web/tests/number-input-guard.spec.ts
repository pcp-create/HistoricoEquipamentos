import {test,expect} from '@playwright/test';
test('number fields ignore wheel and stepping keys, keep typing and let the page scroll',async({page})=>{
 await page.goto('/login');
 await page.evaluate(()=>{
  const panel=document.createElement('div');panel.style.cssText='height:2500px;background:white;position:relative;z-index:99';
  panel.innerHTML='<label>Valor de teste<input aria-label="Valor de teste" type="number" value="12028" style="position:sticky;top:20px"></label>';
  document.body.prepend(panel);
 });
 const input=page.getByRole('spinbutton',{name:'Valor de teste'});
 await input.focus();await input.press('ArrowUp');await expect(input).toHaveValue('12028');
 await input.press('ArrowDown');await expect(input).toHaveValue('12028');
 await input.hover();await page.mouse.wheel(0,300);
 await expect(input).toHaveValue('12028');await expect(input).not.toBeFocused();
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(0);
 await input.fill('54321');await expect(input).toHaveValue('54321');
 expect(await input.evaluate(element=>getComputedStyle(element).appearance)).toBe('textfield');
});
