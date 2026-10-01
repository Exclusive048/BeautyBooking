"use client";

import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useId, useMemo, useRef, type Ref, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SocialLinkPreview } from "@/components/ui/social-link-preview";
import type { AddressStatus, AddressSuggestion } from "@/lib/maps/use-address-with-geocode";
import * as UI_TEXT from "@/lib/ui/text";
import { formatZoneLabel } from "@/lib/ui/zone-label";

type Props = {
  name: string;
  tagline: string;
  description: string;
  address: string;
  phone: string;
  email: string;
  instagram: string;
  vk: string;
  addressInputRef: Ref<HTMLInputElement>;
  addressStatus?: AddressStatus | null;
  addressSuggestions: AddressSuggestion[];
  isAddressSuggestOpen: boolean;
  setIsAddressSuggestOpen: (open: boolean) => void;
  selectAddressSuggestion: (item: AddressSuggestion) => void;
  addressSuggestIndex: number;
  setAddressSuggestIndex: (value: number) => void;
  /** IANA-зона, выведенная из адреса. `null` — адрес ещё не сохранён. */
  timezone: string | null;
  onNameChange: (value: string) => void;
  onTaglineChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onAddressChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onInstagramChange: (value: string) => void;
  onVkChange: (value: string) => void;
};

// FIX-STUDIO-FORM-BORDERS: переопределений больше нет — поля выглядят как во
// всём продукте (`.lux-input`: рамка `--border-control` + заливка `--bg-input`).
//
// 🔴 Здесь жило `border border-white/10 bg-white/[0.06]`, и это была не
// стилистика, а **невидимое поле в светлой теме**: утилита бьёт authored-слой
// `@layer components`, поэтому рамка `.lux-input` заменялась на белую с альфой
// 10% — по белой карточке это контраст ~1.0:1, то есть границы нет вообще
// (WCAG 1.4.11 провален; UI-32 чинил ФОКУС и по этой же причине не видел, что
// в покое рамки нет). Тот же класс дефекта, что UI-01: «класс есть, а видимого
// результата нет». Заливка съедалась ровно так же.
//
// Токены вместо литералов — правило дизайн-скилла: цвет берётся из
// `globals.css`, а не из `white/…`, иначе тема переключается только у части
// поверхности.

export function StudioProfileForm({
  name,
  tagline,
  description,
  address,
  phone,
  email,
  instagram,
  vk,
  addressInputRef,
  addressStatus,
  addressSuggestions,
  isAddressSuggestOpen,
  setIsAddressSuggestOpen,
  selectAddressSuggestion,
  addressSuggestIndex,
  setAddressSuggestIndex,
  timezone,
  onNameChange,
  onTaglineChange,
  onDescriptionChange,
  onAddressChange,
  onPhoneChange,
  onEmailChange,
  onInstagramChange,
  onVkChange,
}: Props) {
  const studioFormText = UI_TEXT.studio.profileForm;
  const addressInputId = useId();
  const addressStatusTone =
    addressStatus?.tone === "success"
      ? "text-success-text"
      : addressStatus?.tone === "error"
        ? "text-danger-text"
        : "text-text-sec";

  const addressSuggestRootRef = useRef<HTMLDivElement | null>(null);

  // «Екатеринбург, GMT+5» — скобки у `formatZoneLabel` нужны только когда метка
  // стоит ПОСЛЕ времени; здесь она сама по себе, поэтому снимаем. Фолбэк —
  // сырой IANA-идентификатор: пустую строку показывать нельзя, пользователь
  // прочтёт её как «пояс не определился».
  const zoneLabel = useMemo(() => {
    if (!timezone) return null;
    const label = formatZoneLabel({ iso: new Date().toISOString(), timeZone: timezone });
    return label ? label.replace(/^\(|\)$/g, "") : timezone;
  }, [timezone]);

  useEffect(() => {
    if (!isAddressSuggestOpen) return;
    const handleDocumentClick = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!addressSuggestRootRef.current) return;
      if (!addressSuggestRootRef.current.contains(target)) {
        setIsAddressSuggestOpen(false);
      }
    };

    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("touchstart", handleDocumentClick);
    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("touchstart", handleDocumentClick);
    };
  }, [isAddressSuggestOpen, setIsAddressSuggestOpen]);

  const handleAddressKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (addressSuggestions.length === 0) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!isAddressSuggestOpen) {
          setIsAddressSuggestOpen(true);
          setAddressSuggestIndex(0);
          return;
        }
        const nextIndex =
          addressSuggestIndex < addressSuggestions.length - 1
            ? addressSuggestIndex + 1
            : 0;
        setAddressSuggestIndex(nextIndex);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (!isAddressSuggestOpen) {
          setIsAddressSuggestOpen(true);
          setAddressSuggestIndex(addressSuggestions.length - 1);
          return;
        }
        const nextIndex =
          addressSuggestIndex <= 0
            ? addressSuggestions.length - 1
            : addressSuggestIndex - 1;
        setAddressSuggestIndex(nextIndex);
        return;
      }

      if (event.key === "Enter" && isAddressSuggestOpen) {
        if (
          addressSuggestIndex >= 0 &&
          addressSuggestIndex < addressSuggestions.length
        ) {
          event.preventDefault();
          selectAddressSuggestion(addressSuggestions[addressSuggestIndex]);
        }
        return;
      }

      if (event.key === "Escape" && isAddressSuggestOpen) {
        setIsAddressSuggestOpen(false);
        return;
      }
    },
    [
      addressSuggestions,
      addressSuggestIndex,
      isAddressSuggestOpen,
      selectAddressSuggestion,
      setAddressSuggestIndex,
      setIsAddressSuggestOpen,
    ]
  );

  return (
    <section className="lux-card rounded-[24px] p-5 md:p-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="-m-2 space-y-4 rounded-2xl p-2" data-guide="profile">
          <div className="space-y-2">
            <div className="text-xs font-medium text-text-label">{studioFormText.nameLabel}</div>
            <Input
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder={studioFormText.namePlaceholder}
            />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-text-label">{studioFormText.taglineLabel}</div>
            <Input
              value={tagline}
              onChange={(event) => onTaglineChange(event.target.value)}
              placeholder={studioFormText.taglinePlaceholder}
              maxLength={140}
            />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-text-label">{studioFormText.descriptionLabel}</div>
            <div className="relative">
              <Textarea
                value={description}
                onChange={(event) => onDescriptionChange(event.target.value.slice(0, 500))}
                placeholder={studioFormText.descriptionPlaceholder}
                maxLength={500}
                rows={4}
                className="resize-none pb-7"
              />
              <span className="absolute bottom-2 right-3 text-xs text-text-sec">{description.length}/500</span>
            </div>
          </div>
          </div>

          <div className="-m-2 space-y-2 rounded-2xl p-2" data-guide="address">
            <label htmlFor={addressInputId} className="block text-xs font-medium text-text-label">
              {studioFormText.addressLabel}
            </label>
            <div ref={addressSuggestRootRef} className="relative">
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center">
                  <MapPin className="h-4 w-4 text-text-sec" />
                </div>
                <Input
                  id={addressInputId}
                  ref={addressInputRef}
                  value={address}
                  onChange={(event) => onAddressChange(event.target.value)}
                  onKeyDown={handleAddressKeyDown}
                  onFocus={() => {
                    if (addressSuggestions.length > 0) {
                      setIsAddressSuggestOpen(true);
                    }
                  }}
                  onBlur={() => {
                    setIsAddressSuggestOpen(false);
                  }}
                  placeholder={studioFormText.addressPlaceholder}
                  className="pl-11"
                />
                {isAddressSuggestOpen && addressSuggestions.length > 0 ? (
                  <div className="absolute z-30 mt-2 w-full rounded-2xl border border-border-subtle bg-bg-card p-2 shadow-card">
                    {addressSuggestions.map((item, index) => (
                      <Button
                        variant="ghost"
                        size="none"
                        key={`${item.value}-${index}`}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setAddressSuggestIndex(index)}
                        onClick={() => selectAddressSuggestion(item)}
                        className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-sm ${
                          index === addressSuggestIndex ? "bg-bg-input" : ""
                        }`}
                        aria-label={studioFormText.selectAddressAria.replace("{address}", item.value)}
                      >
                        <span className="whitespace-normal break-words">{item.value}</span>
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
              {addressStatus ? (
                <div className={`mt-1 text-xs ${addressStatusTone}`}>{addressStatus.text}</div>
              ) : null}
            </div>
          </div>

          {/*
            FIX-STUDIO-TZ-FROM-ADDRESS: пояс только ПОКАЗЫВАЕТСЯ. Выводит его
            сервер из города адреса (`detectCityFromAddress` →
            `updateStudioProviderProfile`), поэтому ручной селектор был третьим
            местом, где одно и то же значение могло разойтись с адресом.
            Показываем, потому что молчаливая правка часового пояса — это
            сдвиг всех записей студии, и увидеть её пользователь обязан.
          */}
          <div className="space-y-1 rounded-2xl border border-border-subtle bg-bg-input/40 px-4 py-3">
            <div className="text-xs font-medium text-text-label">
              {studioFormText.timezoneLabel}
            </div>
            <div className="text-sm text-text-main">
              {zoneLabel ?? studioFormText.timezoneUnknown}
            </div>
            <p className="text-2xs text-text-sec">{studioFormText.timezoneHint}</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="text-xs font-medium text-text-label">{studioFormText.phoneLabel}</div>
              <Input
                value={phone}
                onChange={(event) => onPhoneChange(event.target.value)}
                placeholder={studioFormText.phonePlaceholder}
              />
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium text-text-label">{studioFormText.emailLabel}</div>
              <Input
                value={email}
                onChange={(event) => onEmailChange(event.target.value)}
                placeholder={studioFormText.emailPlaceholder}
              />
            </div>
            {/* FIX-STUDIO-SOCIAL-PERSIST: Telegram contact input removed
                (FZ-199 killswitch — don't collect data the platform won't
                surface). VK + Instagram ARE persisted (FEAT-PROVIDER-SOCIALS,
                `Provider.social{Vk,Instagram}`) — прежняя редакция этого
                комментария утверждала обратное и успела устареть. */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-text-label">{studioFormText.vkLabel}</div>
              <Input
                value={vk}
                onChange={(event) => onVkChange(event.target.value)}
                placeholder={studioFormText.vkPlaceholder}
              />
              <SocialLinkPreview kind="vk" value={vk} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <div className="text-xs font-medium text-text-label">{studioFormText.instagramLabel}</div>
              <Input
                value={instagram}
                onChange={(event) => onInstagramChange(event.target.value)}
                placeholder={studioFormText.instagramPlaceholder}
              />
              <SocialLinkPreview kind="instagram" value={instagram} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
