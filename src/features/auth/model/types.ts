export type AccountType =
  | "GUEST"            // не залогинен
  | "CLIENT"           // обычный пользователь (который записывается)
  | "MASTER_SOLO"      // соло мастер (свой провайдер)
  | "MASTER_IN_STUDIO" // мастер, работающий в студии
  | "STUDIO_ADMIN"     // админ студии
  | "PLATFORM_ADMIN";  // админ платформы (ты)
