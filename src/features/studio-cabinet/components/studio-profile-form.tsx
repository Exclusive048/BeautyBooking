"use client";

import { useCallback, useEffect, useRef, type FormEvent, type Ref, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AddressStatus, AddressSuggestion } from "@/lib/maps/use-address-with-geocode";

type Props = {
  name: string;
  description: string;
  address: string;
  phone: string;
  email: string;
  telegram: string;
  instagram: string;
  vk: string;
  addressInputRef: Ref<HTMLTextAreaElement>;
  addressStatus?: AddressStatus | null;
  addressSuggestions: AddressSuggestion[];
  isAddressSuggestOpen: boolean;
  setIsAddressSuggestOpen: (open: boolean) => void;
  selectAddressSuggestion: (item: AddressSuggestion) => void;
  addressSuggestIndex: number;
  setAddressSuggestIndex: (value: number) => void;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onDescriptionInput: (event: FormEvent<HTMLTextAreaElement>) => void;
  descriptionRef: Ref<HTMLTextAreaElement>;
  onAddressChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onTelegramChange: (value: string) => void;
  onInstagramChange: (value: string) => void;
  onVkChange: (value: string) => void;
};

const inputClass =
  "border-transparent bg-bg-input/70 focus-visible:border-border-focus focus-visible:ring-0";

export function StudioProfileForm({
  name,
  description,
  address,
  phone,
  email,
  telegram,
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
  onNameChange,
  onDescriptionChange,
  onDescriptionInput,
  descriptionRef,
  onAddressChange,
  onPhoneChange,
  onEmailChange,
  onTelegramChange,
  onInstagramChange,
  onVkChange,
}: Props) {
  const addressStatusTone =
    addressStatus?.tone === "success"
      ? "text-emerald-500"
      : addressStatus?.tone === "error"
        ? "text-rose-400"
        : "text-text-sec";

  const addressSuggestRootRef = useRef<HTMLDivElement | null>(null);

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
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (addressSuggestions.length === 0) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!isAddressSuggestOpen) {
          setIsAddressSuggestOpen(true);
          setAddressSuggestIndex(0);
          return;
        }
        setAddressSuggestIndex((prev) =>
          prev < addressSuggestions.length - 1 ? prev + 1 : 0
        );
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (!isAddressSuggestOpen) {
          setIsAddressSuggestOpen(true);
          setAddressSuggestIndex(addressSuggestions.length - 1);
          return;
        }
        setAddressSuggestIndex((prev) =>
          prev <= 0 ? addressSuggestions.length - 1 : prev - 1
        );
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
          <div className="space-y-2">
            <div className="text-xs font-medium text-text-label">Название</div>
            <Input
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Название студии"
              className={inputClass}
            />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-text-label">Описание</div>
            <Textarea
              ref={descriptionRef}
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
              onInput={onDescriptionInput}
              placeholder="Расскажите о студии"
              className={inputClass}
            />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-text-label">Адрес</div>
            <div ref={addressSuggestRootRef} className="relative">
              <Textarea
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
                placeholder="Город, улица, дом"
                className={inputClass}
                rows={2}
              />
              {isAddressSuggestOpen && addressSuggestions.length > 0 ? (
                <div className="absolute z-30 mt-2 w-full rounded-2xl border border-border-subtle bg-bg-card p-2 shadow-card">
                  {addressSuggestions.map((item, index) => (
                    <button
                      type="button"
                      key={`${item.value}-${index}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setAddressSuggestIndex(index)}
                      onClick={() => selectAddressSuggestion(item)}
                      className={`flex w-full items-center rounded-xl px-3 py-2 text-left text-sm transition hover:bg-bg-input ${
                        index === addressSuggestIndex ? "bg-bg-input" : ""
                      }`}
                      aria-label={`Выбрать адрес ${item.value}`}
                    >
                      <span className="whitespace-normal break-words">{item.value}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {addressStatus ? (
                <div className={`mt-1 text-xs ${addressStatusTone}`}>{addressStatus.text}</div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-xs font-medium text-text-label">Телефон</div>
            <Input
              value={phone}
              onChange={(event) => onPhoneChange(event.target.value)}
              placeholder="+7 700 000 00 00"
              className={inputClass}
            />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-text-label">Email</div>
            <Input
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder="studio@email.com"
              className={inputClass}
            />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-text-label">Telegram</div>
            <Input
              value={telegram}
              onChange={(event) => onTelegramChange(event.target.value)}
              placeholder="@studio"
              className={inputClass}
            />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-text-label">Instagram</div>
            <Input
              value={instagram}
              onChange={(event) => onInstagramChange(event.target.value)}
              placeholder="@studio"
              className={inputClass}
            />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-text-label">VK</div>
            <Input
              value={vk}
              onChange={(event) => onVkChange(event.target.value)}
              placeholder="vk.com/studio"
              className={inputClass}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
