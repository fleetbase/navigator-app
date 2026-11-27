/**
 * What to call a place when it has no proper name.
 *
 * Fleetbase builds a place's `address` from its parts (name, street, city,
 * postcode, country). A place saved with only a city and a country arrives as
 * " - ULAANBAATAR, MONGOLIA" or "12 Main St, , ": the separators are left
 * behind by the empty parts. They are not part of the address, so they are
 * trimmed before anything is shown. Used by every screen that names a place.
 */
type PlaceLike = Record<string, unknown> | null | undefined;

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value : undefined);

/** A name or address with stray separators trimmed off its ends and doubled commas closed up. */
export function tidyPlaceText(value: unknown): string | undefined {
    const cleaned = text(value)
        ?.replace(/^[\s,\-–—·]+|[\s,\-–—·]+$/g, '')
        .replace(/\s*,(\s*,)+/g, ',')
        .replace(/\s{2,}/g, ' ')
        .trim();
    return cleaned ? cleaned : undefined;
}

/** The place's own name, when it has a real one. */
export function placeNameOf(place: PlaceLike): string | undefined {
    return tidyPlaceText(place?.name);
}

/** The place's address, tidied; its street when there is no full address. */
export function placeAddressOf(place: PlaceLike): string | undefined {
    return tidyPlaceText(place?.address) ?? tidyPlaceText(place?.street1) ?? tidyPlaceText([place?.city, place?.country].filter((part) => text(part)).join(', '));
}

/**
 * The two lines a place is shown with: a title (its name, else its address)
 * and, under it, the address when the title was the name and the two differ.
 */
export function placeLines(place: PlaceLike): { title?: string; address?: string } {
    const name = placeNameOf(place);
    const address = placeAddressOf(place);
    if (!name) return { title: address };
    return { title: name, address: address && address.toLowerCase() !== name.toLowerCase() ? address : undefined };
}
