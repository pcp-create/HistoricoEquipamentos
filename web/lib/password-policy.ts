export const INITIAL_PASSWORD = '123456';
export function needsPasswordChange(user: {app_metadata?: Record<string,unknown>}) {
  return user.app_metadata?.must_change_password === true;
}
export function passwordValidation(password:unknown,confirmation:unknown):string | null {
  if(typeof password!=='string' || password.length<6 || password.length>128)return 'A nova senha deve ter de 6 a 128 caracteres.';
  if(password.trim()===INITIAL_PASSWORD)return 'Escolha uma senha diferente da senha padrão 123456.';
  if(password!==confirmation)return 'A confirmação da senha não confere.';
  return null;
}
