// Central business data. Edit here (or via the CMS later) — every page reads from this file.
export const SITE = {
  name: 'Exotic Fish Cabo',
  url: 'https://fish-cabo.com',
  email: 'contact@fish-cabo.com',
  phone: '+52-624-122-3506',
  whatsapp: '+526241223506',
  marina: 'Puerto Los Cabos Marina, San José del Cabo, Baja California Sur, Mexico',
  gpsUrl:
    'https://www.google.com/maps/dir/?api=1&destination=23.060275%2C-109.670677&travelmode=driving',
  directionsUrl:
    'https://www.google.com/maps/dir/?api=1&destination=23.060275%2C-109.670677&travelmode=driving',
  bookUrl: '/fishing-boats',
  gps: { lat: 23.060275, lng: -109.670677 },
  googleReviews: 'https://g.page/r/CVkU9WoXqp_DEBM',
  googleLeaveReview: 'https://g.page/r/CVkU9WoXqp_DEBM/review',
  logo: 'ed1a80e6-474f-4efc-ad03-6795b1f1754b/logo+low-res+Fishing+San+Jose+del+Cabo.webp',
  sameAs: [
    'https://www.instagram.com/exoticfishcabo/',
    'https://www.youtube.com/@Exoticpechemexiquechannel',
    'https://www.facebook.com/pechemexique/',
    'https://www.tripadvisor.com/Attraction_Review-g152516-d9569970-Reviews-Exotic_Fish_Cabo_Sportfishing_Charter-San_Jose_del_Cabo_Los_Cabos_Baja_California.html',
    'https://x.com/pechemexique/',
    'https://www.yelp.com/biz/exotic-fish-cabo-san-jos%C3%A9-del-cabo-3',
    'https://www.threads.com/@exoticfishcabo',
  ],
};

// Main navigation — identical order and labels to the current Squarespace header.
export const NAV = [
  {
    label: 'Explore Fishing',
    children: [
      { label: 'Fishing Calendar', href: '/fishing-calendar' },
      { label: 'Fishing Reports', href: '/fishing-reports' },
      { label: 'Family Charters', href: '/family-fishing-charters-san-jose-del-cabo' },
      { label: 'What to Bring', href: '/what-to-bring-fishing-cabo' },
      { label: 'Fish Species', href: '/fish-species' },
      { label: 'Tournaments', href: '/cabo-fishing-tournaments' },
      { label: 'Free guide', href: '/fishing-guide-for-newbies' },
      { label: 'Videos', href: '/cabo-fishing-videos' },
      { label: "FAQ's", href: '/cabo-fishing-faq' },
    ],
  },
  { label: 'Cabo Fishing', href: '/' },
  { label: 'Fishing Charters', href: '/fishing-charters' },
  { label: 'Fishing Boats', href: '/fishing-boats' },
  { label: 'Contact', href: '/contact' },
];

export const FOOTER_NAV = [
  {
    title: 'CHARTERS & BOOKING',
    links: [
      ['Fishing Charters', '/fishing-charters'],
      ['Fishing Boats', '/fishing-boats'],
      ['Family Fishing Charters', '/family-fishing-charters-san-jose-del-cabo'],
      ['Cabo San Lucas Charters', '/cabo-san-lucas-fishing-charters'],
      // F8 — these two indexed pages had no internal link (orphans; reachable only via the sitemap)
      ['Deep Sea Fishing Charters', '/deep-sea-fishing-charters'],
      ['Deep Sea Fishing Cabo', '/deep-sea-fishing-cabo'],
      ['Contact & Booking', '/contact'],
    ],
  },
  {
    title: 'FISHING SPECIES',
    links: [
      ['All Fish Species', '/fish-species'],
      ['Marlin Fishing', '/marlin-fishing-cabo'],
      ['Yellowfin Tuna', '/tuna-fishing-cabo'],
      ['Dorado / Mahi-Mahi', '/dorado-fishing-cabo'],
      ['Roosterfish Fishing', '/roosterfish-fishing-cabo'],
      ['Wahoo Fishing', '/wahoo-fishing-cabo'],
    ],
  },
  {
    title: 'FISHING GROUNDS',
    links: [
      ['Gordo Banks', '/gordo-banks-fishing'],
      ['Iman Bank', '/iman-bank-fishing-san-jose-del-cabo'],
      ['La Fortuna', '/la-fortuna-fishing-san-jose-del-cabo'],
      ['Vinorama', '/vinorama-fishing-san-jose-del-cabo'],
      ['El 25', '/el-25-fishing-san-jose-del-cabo'],
      ['San Luis', '/san-luis-fishing-san-jose-del-cabo'],
    ],
  },
  {
    title: 'PLAN YOUR FISHING TRIP',
    links: [
      ['Fishing Calendar', '/fishing-calendar'],
      ['Fishing Reports', '/fishing-reports'],
      ['Fishing Guide for Beginners', '/fishing-guide-for-newbies'],
      ['What to Bring', '/what-to-bring-fishing-cabo'],
      ['Fishing FAQ', '/cabo-fishing-faq'],
      ['Fishing Tournaments', '/cabo-fishing-tournaments'],
      ['Fishing Videos', '/cabo-fishing-videos'],
    ],
  },
];
