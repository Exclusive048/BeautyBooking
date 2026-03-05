import type { Metadata } from "next";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const LEGAL_ENTITY_NAME = "[Укажи свои данные: ИП Иванов Иван Иванович]";
const INN = "[укажи ИНН]";
const OGRN = "[укажи ОГРН]";
const LEGAL_ADDRESS = "[укажи юридический адрес]";
const CONTACT_EMAILS = {
  privacy: "privacy@МастерРядом.ru",
  legal: "legal@МастерРядом.ru",
  support: "support@МастерРядом.ru",
};

const LISTED_PRICE_RUB = "X₽/мес";
const PROMOTED_PRICE_RUB = "Y₽/мес";
const COMMISSION_PCT = "Z%";
const MIN_PAYOUT_RUB = "W₽";

const DOCUMENT_VERSION = "1.0";
const UPDATED_AT = "17.02.2026";

export const metadata: Metadata = {
  title: "Пользовательское соглашение — МастерРядом",
  description:
    "Пользовательское соглашение МастерРядом: правила использования сервиса, оплаты и ответственности.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-text-main">{title}</h2>
      <div className="space-y-2 text-sm text-text-sec">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <header className="space-y-2">
        <p className="text-xs text-text-sec">
          Версия документа: {DOCUMENT_VERSION} · Дата обновления: {UPDATED_AT}
        </p>
        <h1 className="text-3xl font-semibold text-text-main">Пользовательское соглашение</h1>
        <p className="text-sm text-text-sec">
          Настоящее Соглашение регулирует использование платформы МастерРядом и порядок оказания
          услуг между пользователями, провайдерами и оператором сервиса.
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
          <div>Контакты: {CONTACT_EMAILS.legal}, {CONTACT_EMAILS.support}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-6 text-sm text-text-sec">
          <Section title="1. Термины и определения">
            <p>
              Платформа — сайт и сервисы МастерРядом. Пользователь — физическое лицо, использующее
              сервис. Провайдер — мастер или студия, размещающие услуги и принимающие записи.
            </p>
          </Section>

          <Section title="2. Регистрация и доступ">
            <p>
              Доступ к функционалу сервиса предоставляется после подтверждения номера телефона.
              Пользователь обязуется предоставлять достоверные данные и соблюдать правила сервиса.
            </p>
          </Section>

          <Section title="3. Бронирования и услуги">
            <ul className="list-disc space-y-1 pl-5">
              <li>Пользователь выбирает услугу и свободный слот, подтверждает бронирование.</li>
              <li>Провайдер подтверждает запись и оказывает услугу в согласованное время.</li>
              <li>Сервис не является стороной договора между пользователем и провайдером.</li>
            </ul>
          </Section>

          <Section title="4. Оплата и возвраты">
            <p>
              Оплата может осуществляться онлайн через доступные платежные методы. Возвраты и
              отмены регулируются политиками провайдера и условиями платформы.
            </p>
          </Section>

          <Section title="5. Ответственность">
            <p>
              Оператор сервиса не несет ответственности за качество услуг, оказываемых провайдерами,
              однако стремится обеспечивать надежность платформы и поддержку пользователей.
            </p>
          </Section>

          <Section title="6. Интеллектуальная собственность">
            <p>
              Все материалы и функциональность сервиса принадлежат оператору или используются по
              лицензии. Запрещено копирование и использование без разрешения.
            </p>
          </Section>

          <Section title="7. Прекращение доступа">
            <p>
              Оператор вправе ограничить доступ при нарушении условий соглашения, а пользователь
              может прекратить использование сервиса в любой момент.
            </p>
          </Section>

          <Section title="8. Тарифы и комиссии">
            <p className="font-medium text-text-main">8.1. Тарифные планы для Провайдеров</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Listed: {LISTED_PRICE_RUB} — базовый тариф для размещения услуг.</li>
              <li>Promoted: {PROMOTED_PRICE_RUB} — расширенное продвижение в каталоге.</li>
              <li>Комиссия с онлайн-платежей: {COMMISSION_PCT}.</li>
              <li>Минимальная сумма вывода: {MIN_PAYOUT_RUB}.</li>
            </ul>
            <p className="text-xs text-text-sec">
              Значения тарифов указаны как плейсхолдеры и должны быть обновлены перед запуском.
            </p>
          </Section>

          <Section title="9. Контакты">
            <p>
              Юридические вопросы: {CONTACT_EMAILS.legal}. Техническая поддержка:{" "}
              {CONTACT_EMAILS.support}.
            </p>
          </Section>
        </CardContent>
      </Card>
    </div>
  );
}

