# Prisma Schema — Структура

Схема разделена на доменные файлы (multi-file schema, Prisma ≥ 5.15).

## Файлы

| Файл | Домен | Модели |
|------|-------|--------|
| `base.prisma` | Конфигурация | `datasource`, `generator` |
| `enums.prisma` | Перечисления | Все 31 enum |
| `auth.prisma` | Аутентификация | `UserProfile`, `UserConsent`, `OtpCode`, `RefreshSession`, `TelegramLink`, `TelegramLinkToken`, `VkLink`, `PublicUsernameAlias` |
| `provider.prisma` | Провайдер / Студия | `Provider`, `MasterProfile`, `Studio`, `StudioMember`, `StudioMembership`, `StudioInvite` |
| `service.prisma` | Услуги / Каталог | `Service`, `ServiceBookingQuestion`, `MasterService`, `ServiceCategory`, `GlobalCategory`, `Tag` |
| `booking.prisma` | Бронирование | `Booking`, `BookingServiceItem`, `BookingChat`, `ChatMessage` |
| `schedule.prisma` | Расписание | `WeeklyScheduleConfig`, `WeeklyScheduleDay`, `ScheduleTemplate`, `ScheduleTemplateBreak`, `ScheduleOverride`, `ScheduleBreak`, `ScheduleChangeRequest`, `TimeBlock` |
| `billing.prisma` | Биллинг | `BillingPlan`, `BillingPlanPrice`, `UserSubscription`, `BillingPayment`, `BillingAuditLog` |
| `notification.prisma` | Уведомления | `Notification`, `PushSubscription` |
| `media.prisma` | Медиа / Портфолио | `MediaAsset`, `MediaAssetEmbedding`, `ClientCardPhoto`, `PortfolioItem`, `PortfolioItemService`, `PortfolioItemTag`, `Favorite` |
| `review.prisma` | Отзывы | `Review`, `ReviewTag`, `ReviewTagOnReview` |
| `hot-slot.prisma` | Горячие слоты | `HotSlot`, `HotSlotSubscription`, `DiscountRule` |
| `model-offer.prisma` | Офферы для моделей | `ModelOffer`, `ModelApplication` |
| `crm.prisma` | CRM | `ClientCard`, `ClientNote` |
| `system.prisma` | Система | `AppSetting`, `SystemConfig` |

## Правила

- **Новую модель** — добавить в файл соответствующего домена
- **Новый enum** — добавить в `enums.prisma`
- **Не создавать файл под одну модель** — группировать по домену
- **Связи (`@relation`)** между файлами работают нативно — Prisma разрешает их автоматически
- **После любых изменений схемы:**

```bash
npx prisma validate
npx prisma generate
```
