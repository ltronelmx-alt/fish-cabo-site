// The 10 boat options, in the same order and wording as fish-cabo.com/fishing-boats.
// Boats are identified by size and category only (no boat or captain names).
export type Boat = {
  slug: string;
  title: string;
  label: string; // "Boat#1"
  blurb: string;
  button: string;
  capacity: number;
  image: { src: string; alt: string; width: number; height: number };
};

export const BOATS: Boat[] = [
  { slug: '23ft-panga', title: '23Ft Panga', label: 'Boat#1', capacity: 2, button: 'View 23Ft Panga',
    blurb: 'A compact and affordable private fishing boat for 1–2 guests. Its simple, practical layout makes it an excellent choice for couples or solo anglers looking for a straightforward fishing experience in San José del Cabo.',
    image: { src: '505fc072-1705-4425-aa79-71de7ea28485/23-ft+panga.webp', alt: '23-ft panga fishing san jose del cabo', width: 1092, height: 667 } },
  { slug: '26ft-super-panga', title: '26Ft Super panga', label: 'Boat#2', capacity: 3, button: 'View 26Ft Super Panga',
    blurb: 'A versatile 26-foot fishing boat accommodating up to 3 guests. Ideal for couples and small groups seeking a private fishing adventure with more space than a traditional panga.',
    image: { src: 'ae474e4c-80fd-4491-91c5-fdabc0d00cb7/26ft+super+panga+fishing+san+jose+del+cabo.webp', alt: '26ft super panga fishing san jose del cabo', width: 1200, height: 797 } },
  { slug: '27ft-premium-center-console', title: '27ft premium center console', label: 'Boat#3', capacity: 4, button: 'View 27Ft center console',
    blurb: 'A comfortable center console for up to 4 guests, featuring an open fishing deck, cushioned seating, and an onboard toilet. A great option for families and small groups wanting extra comfort while fishing.',
    image: { src: '529f2243-d23b-4633-a5ef-75f62bca6a4f/fishing+San+Jose+del+Cabo+27Ft.webp', alt: 'A white fishing boat on calm water during sunset with a person in the steering area, and a sky painted with pink and orange hues in the background. San Jose del Cabo fishing charters', width: 1200, height: 772 } },
  { slug: '30ft-cuddy-cabin', title: '30ft Cuddy cabin', label: 'Boat#4', capacity: 6, button: 'View 30Ft Cuddy Cabin',
    blurb: 'Designed for groups of up to 6 guests, this fishing boat combines an open fishing area with a sheltered cabin, comfortable seating, and onboard facilities. An appealing choice for family fishing trips.',
    image: { src: 'b0c7dbc5-74df-480f-a6d1-1afd79712cf4/30ft+cuddy+cabin+fishing+San+Jose+del+Cabo.webp', alt: '30ft cuddy cabin fishing San Jose del Cabo', width: 1200, height: 797 } },
  { slug: '38ft-flybridge', title: '38ft fly bridge', label: 'Boat#5', capacity: 8, button: 'View 38Ft Flybridge',
    blurb: 'A spacious flybridge fishing boat accommodating up to 8 guests. Its elevated viewing area, sheltered cabin, and comfortable seating make it a practical option for larger groups seeking additional onboard comfort.',
    image: { src: '8d45feed-30fd-40cc-b61c-efc171be3a11/38Ft+Flybridge+fishing+San+Jose+del+Cabo.webp', alt: '38Ft Flybridge fishing San Jose del Cabo', width: 1200, height: 832 } },
  { slug: '31ft-premium-center-console', title: '31ft premium cent. console', label: 'Boat#6', capacity: 5, button: 'View 31Ft Center Console',
    blurb: 'A well-equipped center console for up to 5 guests, featuring twin outboard engines, a spacious fishing deck, a shaded T-top, and an onboard toilet. Ideal for anglers who appreciate open fishing space and convenience.',
    image: { src: '9240e701-3192-43e5-994e-4e8fa814baf8/Fishing+San+Jose+del+Cabo+31Ft.webp', alt: 'A white yacht docked in a marina with palm trees and a pink sunset sky in the background. Fishing San Jose del Cabo', width: 2382, height: 1550 } },
  { slug: '29-ft-catamaran-center-console', title: '29ft Catamaran Center Console', label: 'Boat#7', capacity: 6, button: 'View 29Ft Catamaran',
    blurb: 'A distinctive twin-hull fishing catamaran for up to 6 guests. Its wide, stable fishing platform, twin outboard engines, and comfortable seating offer an alternative to traditional single-hull center consoles.',
    image: { src: 'ad2a6356-f668-4895-baed-dfe9e63b4516/29+Ft+Catamaran+Center+Console.webp', alt: 'A white boat on calm water near a modern condo complex with palm trees and other boats in the background. Fishing san jose del cabo', width: 1200, height: 873 } },
  { slug: '35ft-premium-cuddy-cabin', title: '35ft premium Cuddy cabin', label: 'Boat#8', capacity: 8, button: 'View 35Ft Cuddy Cabin',
    blurb: 'A spacious fishing boat for up to 8 guests, combining a sheltered cabin, shaded seating, and onboard navigation and fish-finding electronics. Well suited to families and groups planning longer offshore fishing trips.',
    image: { src: 'd2d41a96-63bc-4cec-9f96-e481459465c9/Fishing+San+Jose+del+Cabo+35Ft.webp', alt: 'A white yacht docked at a marina during a colorful sunset, with other boats and palm trees in the background. San Jose del Cabo fishing charters', width: 1224, height: 768 } },
  { slug: '44ft-premium-flybridge', title: '44Ft premium flybridge', label: 'Boat#9', capacity: 10, button: 'View 44Ft Flybridge',
    blurb: 'Our largest private fishing boat option, accommodating up to 10 guests. Featuring an elevated flybridge, generous fishing deck, and sheltered cabin, it is ideal for bigger groups seeking space and comfort.',
    image: { src: '8e35f2e5-eaba-4e78-9e68-5e78b78652f3/44ft+premium+flybridge+yacht+fishing+san+jose+del+cabo.webp', alt: 'A white yacht with a black tinted window in calm water, with a sunset sky and palm trees in the background. San Jose del Cabo fishing charters', width: 1200, height: 780 } },
  { slug: '37ft-ultimate-fishing-machine', title: '37ft Offshore Catamaran', label: 'Boat#10', capacity: 6, button: 'View 37Ft Offshore Catamaran',
    blurb: 'A powerful offshore fishing catamaran for up to 6 guests, featuring a twin-hull design, four outboard engines, and a spacious open deck. An excellent option for anglers prioritizing fishing space and offshore capability.',
    image: { src: '61e92809-a5d1-4df6-ae88-85efb07f9587/freeman+cruise.webp', alt: 'A white motorboat with four engines moving quickly through the water with a wake behind it. Fishing San Jose del Cabo', width: 785, height: 497 } },
];
