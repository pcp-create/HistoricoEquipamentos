import { jobTitles } from "../user-modules";
export function priceManager(user: any) {
  return (
    user?.enabled === true &&
    (user.role === "admin" ||
      user.role === "manager" ||
      jobTitles(user).some((t) =>
        /^(gestor|gestora|coordenador|coordenadora|diretor|diretora)(\s|$)/i.test(
          t.trim(),
        ),
      ))
  );
}
