import { Field, fieldClasses } from "@/components/ui/action-form";

/** The fields for a service type, shared by the add and edit forms. */
export function ServiceTypeFields({
  values,
}: {
  values?: {
    name: string;
    startTime: string;
    durationMinutes: number;
    location: string;
    notes: string;
  };
}) {
  return (
    <>
      <Field id="type-name" label="Name">
        <input
          id="type-name"
          name="name"
          required
          maxLength={80}
          defaultValue={values?.name}
          placeholder="Sunday service"
          className={fieldClasses}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="type-start" label="Starts (Winnipeg time)">
          <input
            id="type-start"
            name="startTime"
            type="time"
            required
            defaultValue={values?.startTime}
            className={fieldClasses}
          />
        </Field>
        <Field id="type-length" label="Length in minutes">
          <input
            id="type-length"
            name="durationMinutes"
            type="number"
            min={15}
            max={720}
            step={5}
            required
            defaultValue={values?.durationMinutes ?? 120}
            className={fieldClasses}
          />
        </Field>
      </div>
      <Field id="type-location" label="Location (optional)">
        <input
          id="type-location"
          name="location"
          maxLength={120}
          defaultValue={values?.location}
          className={fieldClasses}
        />
      </Field>
      <Field id="type-notes" label="Notes for the team (optional)">
        <textarea
          id="type-notes"
          name="notes"
          rows={2}
          maxLength={1000}
          defaultValue={values?.notes}
          className={`${fieldClasses} py-3`}
        />
      </Field>
    </>
  );
}
