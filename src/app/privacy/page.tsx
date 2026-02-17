import type { Metadata } from "next";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const LEGAL_ENTITY_NAME = "[Укажи свои данные: ИП Иванов Иван Иванович]";
const INN = "[укажи ИНН]";
const OGRN = "[укажи ОГРН]";
const LEGAL_ADDRESS = "[укажи юридический адрес]";
const CONTACT_EMAILS = {
  privacy: "privacy@beautyhub.ru",
  legal: "legal@beautyhub.ru",
  support: "support@beautyhub.ru",
};

const DOCUMENT_VERSION = "1.0";
const UPDATED_AT = "17.02.2026";

export const metadata: Metadata = {
  title: "Политика конфиденциальности — BeautyHub",
  description:
    "Политика конфиденциальности BeautyHub: какие данные собираем, как используем и как защищаем.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-text-main">{title}</h2>
      <div className="space-y-2 text-sm text-text-sec">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <header className="space-y-2">
        <p className="text-xs text-text-sec">
          Версия документа: {DOCUMENT_VERSION} · Дата обновления: {UPDATED_AT}
        </p>
        <h1 className="text-3xl font-semibold text-text-main">Политика конфиденциальности</h1>
        <p className="text-sm text-text-sec">
          Настоящая Политика описывает, какие персональные данные мы собираем, как их используем и
          какие права есть у пользователей сервиса BeautyHub.
        </p>
      </header>

      <Card>
        <CardHeader className="space-y-1">
          <div className="text-sm font-semibold text-text-main">TODO: заполнить реквизиты</div>
          <p className="text-xs text-text-sec">
            Перед запуском в прод замените плейсхолдеры на реальные данные оператора.
          </p>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-text-sec">
          <div>{LEGAL_ENTITY_NAME}</div>
          <div>ИНН: {INN}</div>
          <div>ОГРН/ОГРНИП: {OGRN}</div>
          <div>Юридический адрес: {LEGAL_ADDRESS}</div>
          <div>Контакты: {CONTACT_EMAILS.privacy}, {CONTACT_EMAILS.legal}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-6 text-sm text-text-sec">
          <Section title="1. Общие положения">
            <p>
              Оператор обрабатывает персональные данные в соответствии с законодательством РФ и
              настоящей Политикой. Используя сервис BeautyHub, пользователь подтверждает согласие с
              условиями обработки данных.
            </p>
          </Section>

          <Section title="2. Какие данные мы собираем">
            <ul className="list-disc space-y-1 pl-5">
              <li>Контактные данные: телефон, электронная почта.</li>
              <li>Данные профиля: имя, фото, предпочтения, история записей.</li>
              <li>Технические данные: IP-адрес, cookies, пользовательский агент, логи действий.</li>
            </ul>
          </Section>

          <Section title="3. Цели обработки">
            <ul className="list-disc space-y-1 pl-5">
              <li>Регистрация и авторизация пользователей.</li>
              <li>Организация и управление бронированиями услуг.</li>
              <li>Поддержка, уведомления и улучшение качества сервиса.</li>
              <li>Выполнение требований законодательства.</li>
            </ul>
          </Section>

          <Section title="4. Правовые основания">
            <p>
              Основанием обработки является согласие пользователя, заключение и исполнение договора
              на оказание услуг, а также требования законодательства.
            </p>
          </Section>

          <Section title="5. Хранение и защита данных">
            <p>
              Мы применяем технические и организационные меры безопасности для защиты данных от
              несанкционированного доступа, изменения, раскрытия или уничтожения.
            </p>
          </Section>

          <Section title="6. Передача третьим лицам">
            <p>
              Данные могут передаваться партнерам и подрядчикам (например, платежным провайдерам,
              сервисам уведомлений) только в объеме, необходимом для оказания услуг, и при соблюдении
              конфиденциальности.
            </p>
          </Section>

          <Section title="7. Права пользователя">
            <ul className="list-disc space-y-1 pl-5">
              <li>Получать информацию об обработке своих данных.</li>
              <li>Требовать уточнения, блокирования или удаления данных.</li>
              <li>Отозвать согласие на обработку данных.</li>
            </ul>
          </Section>

          <Section title="8. Контакты">
            <p>
              По вопросам обработки персональных данных пишите на {CONTACT_EMAILS.privacy} или{" "}
              {CONTACT_EMAILS.legal}.
            </p>
            <p>
              Техническая поддержка: {CONTACT_EMAILS.support}.
            </p>
          </Section>
        </CardContent>
      </Card>
    </div>
  );
}
