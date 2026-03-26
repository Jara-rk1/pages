// ==================== MELBOURNE FOOD CLUB — DATA ====================

const VENUES = [
  {
    id: 1,
    name: "Higher Ground",
    type: "cafe",
    suburb: "Melbourne CBD",
    suburbGroup: "CBD & Inner City",
    address: "650 Little Bourke St, Melbourne VIC 3000",
    lat: -37.8125, lng: 144.9565,
    description: "A stunning converted power station serving inventive brunch and specialty coffee across multiple levels.",
    phone: "(03) 8899 6219",
    hours: "Mon–Fri 7am–4pm, Sat–Sun 8am–4pm",
    priceRange: "$$",
    tags: ["brunch", "specialty coffee", "architectural"],
    image: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=600&h=400&fit=crop",
    participatingEvents: [1, 3],
    menu: [
      { category: "Brunch", items: [
        { name: "Ricotta Hotcake", price: 24, description: "With banana, honeycomb butter & maple", isNew: true },
        { name: "Avo Smash", price: 22, description: "Sourdough, feta, chilli, poached eggs" },
        { name: "Shakshuka", price: 23, description: "Baked eggs, tomato sugo, grilled bread, labneh" },
        { name: "Granola Bowl", price: 19, description: "House granola, coconut yoghurt, seasonal fruit" }
      ]},
      { category: "Lunch", items: [
        { name: "Grilled Chicken Salad", price: 26, description: "Freekeh, pomegranate, tahini dressing", isNew: true },
        { name: "Fish Tacos", price: 24, description: "Beer-battered flathead, slaw, chipotle mayo" },
        { name: "Mushroom Risotto", price: 25, description: "Porcini, truffle oil, parmesan" }
      ]},
      { category: "Drinks", items: [
        { name: "Flat White", price: 5, description: "Single origin, Seven Seeds roast" },
        { name: "Matcha Latte", price: 6.5, description: "Ceremonial grade, oat milk" },
        { name: "Fresh OJ", price: 8, description: "Cold-pressed, seasonal citrus" }
      ]}
    ],
    criticReviews: [
      { id: 101, author: "Sarah Chen", role: "Committee Lead", date: "2026-03-10", rating: 9, text: "Higher Ground continues to set the standard for Melbourne brunch. The ricotta hotcake is a must-order — perfectly caramelised, not too sweet. The space itself is breathtaking with its soaring ceilings and warm lighting. Service was attentive without being overbearing. The new chicken salad is a solid lunch addition.", likes: 34, comments: [
        { author: "Mike T", date: "2026-03-11", text: "Totally agree about the hotcakes. Best in Melbourne." },
        { author: "Lisa K", date: "2026-03-12", text: "How's the wait on weekends these days?" }
      ]},
      { id: 102, author: "James Patel", role: "Food Critic", date: "2026-02-28", rating: 8, text: "Consistently excellent coffee and the brunch menu has just the right amount of creativity without being gimmicky. Docked a point for weekend wait times — plan to queue for 30+ minutes on Saturdays. The shakshuka is underrated.", likes: 21, comments: [] }
    ],
    communityReviews: [
      { id: 201, author: "FoodieEmma", date: "2026-03-15", rating: 9, text: "My absolute favourite spot! The space is gorgeous and the food never disappoints. The new matcha latte is amazing.", likes: 12, comments: [
        { author: "BrunchLover", date: "2026-03-16", text: "Is it worth the weekend wait though?" },
        { author: "FoodieEmma", date: "2026-03-16", text: "Honestly yes, but go early — 8am and you'll get straight in." }
      ]},
      { id: 202, author: "CafeCrawler", date: "2026-03-08", rating: 7, text: "Great food but very pricey for what you get. Coffee is top notch though.", likes: 5, comments: [] },
      { id: 203, author: "MelbMatt", date: "2026-02-20", rating: 10, text: "Took my parents here visiting from Sydney and they were blown away. The architecture alone is worth the visit.", likes: 18, comments: [] }
    ]
  },
  {
    id: 2,
    name: "Lune Croissanterie",
    type: "cafe",
    suburb: "Fitzroy",
    suburbGroup: "Inner North",
    address: "119 Rose St, Fitzroy VIC 3065",
    lat: -37.7998, lng: 144.9782,
    description: "World-famous croissanterie in a striking space. Watch artisan croissants being crafted through the glass window.",
    phone: "(03) 9419 2320",
    hours: "Tue–Sun 7:30am–3pm",
    priceRange: "$$",
    tags: ["pastry", "croissants", "artisan"],
    image: "https://images.unsplash.com/photo-1555507036-ab1f4038024a?w=600&h=400&fit=crop",
    participatingEvents: [2],
    menu: [
      { category: "Croissants", items: [
        { name: "Classic Butter Croissant", price: 7.5, description: "72-hour fermented, French butter" },
        { name: "Almond Croissant", price: 9, description: "Frangipane filled, toasted almonds" },
        { name: "Ham & Gruyère", price: 11, description: "Smoked ham, gruyère, béchamel" },
        { name: "Lemon Curd Cruffin", price: 10, description: "Seasonal cruffin, house-made curd", isNew: true }
      ]},
      { category: "Drinks", items: [
        { name: "Batch Brew", price: 5, description: "Rotating single origin" },
        { name: "Hot Chocolate", price: 6, description: "Mörk chocolate, house blend" }
      ]}
    ],
    criticReviews: [
      { id: 103, author: "Sarah Chen", role: "Committee Lead", date: "2026-03-05", rating: 10, text: "The best croissant in the Southern Hemisphere — possibly the world. Lune's attention to detail is unmatched. The 72-hour fermentation process creates layers that shatter perfectly. The new lemon cruffin is divine. Worth every cent.", likes: 45, comments: [
        { author: "PastryFan", date: "2026-03-06", text: "The cruffin sold out by 10am when I went!" }
      ]}
    ],
    communityReviews: [
      { id: 204, author: "BrunchLover", date: "2026-03-12", rating: 10, text: "Life-changing croissants. I drive 40 minutes for these. The almond croissant is perfection.", likes: 28, comments: [] },
      { id: 205, author: "NewToMelb", date: "2026-03-01", rating: 9, text: "Just moved to Melbourne and this was my first stop. Did not disappoint — the hype is real.", likes: 15, comments: [
        { author: "MelbLocal", date: "2026-03-02", text: "Welcome to Melbourne! You've started in the right place." }
      ]}
    ]
  },
  {
    id: 3,
    name: "Chin Chin",
    type: "restaurant",
    suburb: "Melbourne CBD",
    suburbGroup: "CBD & Inner City",
    address: "125 Flinders Ln, Melbourne VIC 3000",
    lat: -37.8168, lng: 144.9690,
    description: "Iconic Asian-inspired restaurant with bold flavours, loud music, and a buzzing atmosphere on Flinders Lane.",
    phone: "(03) 8663 2000",
    hours: "Daily 11am–11pm",
    priceRange: "$$$",
    tags: ["asian fusion", "dinner", "cocktails"],
    image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&h=400&fit=crop",
    participatingEvents: [1],
    menu: [
      { category: "Share Plates", items: [
        { name: "Pad See Ew", price: 24, description: "Wok-fried noodles, Chinese broccoli, egg" },
        { name: "Crispy Barramundi", price: 36, description: "Green nahm jim, herbs, crispy shallots", isNew: true },
        { name: "Massaman Curry", price: 28, description: "Slow-cooked beef cheek, potato, peanuts" },
        { name: "Raw Kingfish", price: 26, description: "Yuzu, jalapeño, sesame, nori" }
      ]},
      { category: "Mains", items: [
        { name: "Whole Roasted Duck", price: 58, description: "Pancakes, hoisin, cucumber, spring onion" },
        { name: "Chargrilled Lamb", price: 42, description: "Rendang spices, roti, pickled daikon" }
      ]},
      { category: "Cocktails", items: [
        { name: "Lychee Martini", price: 22, description: "Vodka, lychee liqueur, lime" },
        { name: "Thai Basil Smash", price: 24, description: "Gin, Thai basil, lime, sugar", isNew: true }
      ]}
    ],
    criticReviews: [
      { id: 104, author: "Marcus Wong", role: "Restaurant Critic", date: "2026-03-12", rating: 8, text: "Chin Chin remains one of Melbourne's most electric dining rooms. The new crispy barramundi is excellent — crisp skin, punchy nahm jim. Still no reservations, so prepare to wait, but the cocktail list makes the wait bearable. The massaman is still the sleeper hit.", likes: 29, comments: [] }
    ],
    communityReviews: [
      { id: 206, author: "DinnerDate", date: "2026-03-14", rating: 8, text: "Always a good time. Loud, vibrant, and the food delivers. Cocktails are pricey but worth it.", likes: 9, comments: [] },
      { id: 207, author: "SpiceKing", date: "2026-03-02", rating: 9, text: "The massaman curry is one of the best I've had outside Thailand. Rich, complex, beautiful.", likes: 14, comments: [
        { author: "ThaiFoodFan", date: "2026-03-03", text: "Have you tried their pad see ew? Equally impressive." }
      ]},
      { id: 208, author: "QuietDiner", date: "2026-02-15", rating: 6, text: "Food is great but it's SO loud. Hard to have a conversation. Not for a quiet dinner.", likes: 7, comments: [] }
    ]
  },
  {
    id: 4,
    name: "Auction Rooms",
    type: "cafe",
    suburb: "North Melbourne",
    suburbGroup: "Inner North",
    address: "103-107 Errol St, North Melbourne VIC 3051",
    lat: -37.7990, lng: 144.9450,
    description: "Beloved neighbourhood cafe in a converted auction house. Known for excellent coffee and generous portions.",
    phone: "(03) 9326 7749",
    hours: "Daily 7am–4pm",
    priceRange: "$$",
    tags: ["brunch", "coffee", "neighbourhood"],
    image: "https://images.unsplash.com/photo-1559925393-8be0ec4767c8?w=600&h=400&fit=crop",
    participatingEvents: [3],
    menu: [
      { category: "Breakfast", items: [
        { name: "Big Breakfast", price: 25, description: "Eggs, bacon, sausage, mushroom, toast, relish" },
        { name: "Eggs Benedict", price: 22, description: "Sourdough, hollandaise, choice of ham or salmon" },
        { name: "Bircher Muesli", price: 17, description: "Overnight oats, apple, yoghurt, honey" }
      ]},
      { category: "Lunch", items: [
        { name: "Steak Sandwich", price: 24, description: "Scotch fillet, caramelised onion, aioli, chips", isNew: true },
        { name: "Poke Bowl", price: 22, description: "Salmon, avocado, edamame, brown rice" }
      ]},
      { category: "Coffee", items: [
        { name: "Espresso", price: 4.5, description: "Code Black roast" },
        { name: "Cold Brew", price: 6, description: "16-hour steep, served on ice" }
      ]}
    ],
    criticReviews: [
      { id: 105, author: "Priya Sharma", role: "Cafe Specialist", date: "2026-02-25", rating: 8, text: "Auction Rooms is the quintessential Melbourne neighbourhood cafe. Nothing fancy, just consistently great food and coffee. The new steak sandwich is a belter — perfectly cooked scotch fillet with proper chips. The space has genuine character.", likes: 19, comments: [] }
    ],
    communityReviews: [
      { id: 209, author: "NorthMelbLocal", date: "2026-03-10", rating: 9, text: "My local and I wouldn't have it any other way. Best coffee on Errol St, hands down.", likes: 11, comments: [] },
      { id: 210, author: "WeekendWarrior", date: "2026-03-05", rating: 8, text: "Great brunch spot. Big breakfast is generous and well-executed. Dog-friendly courtyard is a bonus.", likes: 6, comments: [] }
    ]
  },
  {
    id: 5,
    name: "Tipo 00",
    type: "restaurant",
    suburb: "Melbourne CBD",
    suburbGroup: "CBD & Inner City",
    address: "361 Little Bourke St, Melbourne VIC 3000",
    lat: -37.8132, lng: 144.9600,
    description: "Intimate pasta bar serving handmade pasta with Italian technique and Japanese precision. A Melbourne institution.",
    phone: "(03) 9942 3946",
    hours: "Tue–Sat 12pm–3pm, 5:30pm–11pm",
    priceRange: "$$$",
    tags: ["pasta", "italian", "fine dining"],
    image: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=400&fit=crop",
    participatingEvents: [1, 4],
    menu: [
      { category: "Antipasti", items: [
        { name: "Burrata", price: 24, description: "Stracciatella, heritage tomato, basil oil" },
        { name: "Crudo", price: 22, description: "Yellowtail, yuzu, finger lime", isNew: true }
      ]},
      { category: "Pasta", items: [
        { name: "Mafaldine", price: 32, description: "Duck ragù, porcini, pecorino" },
        { name: "Tagliolini", price: 34, description: "Spanner crab, chilli, bottarga" },
        { name: "Tortellini", price: 30, description: "Pumpkin, brown butter, amaretti, sage" },
        { name: "Pappardelle", price: 33, description: "Wagyu bolognese, parmesan", isNew: true }
      ]},
      { category: "Dolci", items: [
        { name: "Tiramisu", price: 18, description: "Classic, house-made savoiardi" },
        { name: "Panna Cotta", price: 16, description: "Vanilla bean, seasonal compote" }
      ]}
    ],
    criticReviews: [
      { id: 106, author: "Marcus Wong", role: "Restaurant Critic", date: "2026-03-18", rating: 10, text: "Tipo 00 is Melbourne's best pasta bar — full stop. The mafaldine with duck ragù has perfect bite and depth of flavour. The new pappardelle wagyu bolognese is extraordinary. Intimate, precise, passionate. Book ahead.", likes: 52, comments: [
        { author: "PastaLover", date: "2026-03-19", text: "Agreed. The tagliolini with crab is also incredible." }
      ]}
    ],
    communityReviews: [
      { id: 211, author: "ItalianFoodLover", date: "2026-03-20", rating: 10, text: "Best pasta I've ever eaten. The tortellini is pure magic. Small space, big flavours.", likes: 23, comments: [] },
      { id: 212, author: "DateNight", date: "2026-03-08", rating: 9, text: "Perfect date spot. Intimate, delicious, and the wine list is excellent. Just book early.", likes: 10, comments: [] }
    ]
  },
  {
    id: 6,
    name: "Proud Mary",
    type: "cafe",
    suburb: "Collingwood",
    suburbGroup: "Inner North",
    address: "172 Oxford St, Collingwood VIC 3066",
    lat: -37.8010, lng: 144.9870,
    description: "Pioneer of Melbourne's specialty coffee scene with innovative brunch dishes and an industrial-chic warehouse space.",
    phone: "(03) 9417 5930",
    hours: "Mon–Fri 7am–4pm, Sat–Sun 8am–4pm",
    priceRange: "$$",
    tags: ["specialty coffee", "brunch", "warehouse"],
    image: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&h=400&fit=crop",
    participatingEvents: [2, 3],
    menu: [
      { category: "Brunch", items: [
        { name: "Kimchi Fried Rice", price: 23, description: "Pork belly, fried egg, gochujang", isNew: true },
        { name: "Corn Fritters", price: 21, description: "Avocado, bacon, sour cream, sweet chilli" },
        { name: "Acai Bowl", price: 19, description: "Granola, berries, coconut, nut butter" }
      ]},
      { category: "Coffee", items: [
        { name: "Filter Coffee", price: 6, description: "Rotating single origin, V60 or Aeropress" },
        { name: "Espresso", price: 5, description: "House blend or single origin" },
        { name: "Cold Drip", price: 7, description: "12-hour cold drip, served neat or on ice" }
      ]}
    ],
    criticReviews: [
      { id: 107, author: "Priya Sharma", role: "Cafe Specialist", date: "2026-03-15", rating: 9, text: "Proud Mary continues to push boundaries. The new kimchi fried rice is a brunch game-changer — smoky pork belly, perfectly crispy rice, and just the right amount of heat. Their filter coffee programme remains one of the city's best.", likes: 27, comments: [] }
    ],
    communityReviews: [
      { id: 213, author: "CoffeeSnob", date: "2026-03-18", rating: 10, text: "Best coffee in Melbourne, bar none. The filter options are incredible. Space is great too.", likes: 16, comments: [] },
      { id: 214, author: "BrunchQueen", date: "2026-03-05", rating: 8, text: "Corn fritters are legendary. Gets busy on weekends but moves quickly.", likes: 8, comments: [] }
    ]
  },
  {
    id: 7,
    name: "Attica",
    type: "restaurant",
    suburb: "Ripponlea",
    suburbGroup: "Bayside",
    address: "74 Glen Eira Rd, Ripponlea VIC 3185",
    lat: -37.8795, lng: 144.9990,
    description: "Ben Shewry's acclaimed fine dining restaurant celebrating native Australian ingredients. Consistently ranked among the world's best.",
    phone: "(03) 9530 0111",
    hours: "Tue–Sat 6pm–late",
    priceRange: "$$$$",
    tags: ["fine dining", "native ingredients", "degustation"],
    image: "https://images.unsplash.com/photo-1550966871-3ed3cdb51f3a?w=600&h=400&fit=crop",
    participatingEvents: [4],
    menu: [
      { category: "Degustation (8 courses)", items: [
        { name: "Tasting Menu", price: 320, description: "8-course journey through Australian landscapes" },
        { name: "Wine Pairing", price: 180, description: "Matched Australian wines" }
      ]},
      { category: "Signature Dishes", items: [
        { name: "Potato Cooked in the Earth", price: 0, description: "Attica's iconic dish — included in degustation" },
        { name: "Salted Red Kangaroo", price: 0, description: "Native pepperberry, Davidson plum", isNew: true },
        { name: "Wattleseed Ice Cream", price: 0, description: "Bush honey, finger lime" }
      ]}
    ],
    criticReviews: [
      { id: 108, author: "Sarah Chen", role: "Committee Lead", date: "2026-03-01", rating: 10, text: "A once-in-a-lifetime dining experience that reconnects you with the Australian landscape. Every course tells a story. The new kangaroo dish is powerful — both in flavour and narrative. Ben Shewry is a national treasure. Book months in advance.", likes: 67, comments: [
        { author: "FineDiner", date: "2026-03-02", text: "Worth the 3-month wait for a booking. Absolutely." }
      ]}
    ],
    communityReviews: [
      { id: 215, author: "SpecialOccasion", date: "2026-03-10", rating: 10, text: "Celebrated our anniversary here. Transcendent. The potato dish made me emotional. Worth every dollar.", likes: 31, comments: [] },
      { id: 216, author: "FoodPilgrim", date: "2026-02-20", rating: 9, text: "Flew from Sydney specifically for this. Not a single miss across 8 courses. The wine pairing is excellent.", likes: 19, comments: [] }
    ]
  },
  {
    id: 8,
    name: "Cibi",
    type: "cafe",
    suburb: "Collingwood",
    suburbGroup: "Inner North",
    address: "45 Keele St, Collingwood VIC 3066",
    lat: -37.8005, lng: 144.9920,
    description: "Japanese-inspired cafe and lifestyle store in a beautiful converted warehouse. Zen vibes and meticulous food.",
    phone: "(03) 9077 3941",
    hours: "Mon–Sat 8am–4pm, Sun 9am–4pm",
    priceRange: "$$",
    tags: ["japanese", "cafe", "lifestyle"],
    image: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600&h=400&fit=crop",
    participatingEvents: [2],
    menu: [
      { category: "Morning", items: [
        { name: "Japanese Breakfast", price: 24, description: "Grilled fish, miso, pickles, rice, egg", isNew: false },
        { name: "Tamago Sando", price: 16, description: "Fluffy egg sandwich, milk bread, kewpie" },
        { name: "Matcha Pancakes", price: 20, description: "Matcha batter, black sesame, maple", isNew: true }
      ]},
      { category: "Lunch", items: [
        { name: "Donburi", price: 22, description: "Daily rice bowl — check specials board" },
        { name: "Soba Salad", price: 20, description: "Cold soba, dashi dressing, seasonal vegetables" }
      ]},
      { category: "Drinks", items: [
        { name: "Hojicha Latte", price: 6, description: "Roasted green tea, oat milk" },
        { name: "Yuzu Soda", price: 7, description: "House-made yuzu syrup, sparkling water" }
      ]}
    ],
    criticReviews: [
      { id: 109, author: "James Patel", role: "Food Critic", date: "2026-03-08", rating: 9, text: "Cibi is a sanctuary. The Japanese breakfast is transportive — each element prepared with precision. The new matcha pancakes are a worthy addition. The space itself, with the adjoining shop, makes every visit feel like a mini retreat.", likes: 22, comments: [] }
    ],
    communityReviews: [
      { id: 217, author: "ZenBruncher", date: "2026-03-14", rating: 9, text: "The most peaceful cafe in Melbourne. Tamago sando is addictive. Love browsing the shop afterwards.", likes: 13, comments: [] },
      { id: 218, author: "JapanMiss", date: "2026-03-01", rating: 10, text: "Reminds me of cafes in Tokyo. Authentic, beautiful, and the food is spot on. The hojicha latte is the best I've found in Melbourne.", likes: 17, comments: [] }
    ]
  },
  {
    id: 9,
    name: "Supernormal",
    type: "restaurant",
    suburb: "Melbourne CBD",
    suburbGroup: "CBD & Inner City",
    address: "180 Flinders Ln, Melbourne VIC 3000",
    lat: -37.8173, lng: 144.9682,
    description: "Andrew McConnell's sleek Asian-influenced restaurant. From dumplings to lobster rolls, every dish is polished.",
    phone: "(03) 9650 8688",
    hours: "Daily 11am–11pm",
    priceRange: "$$$",
    tags: ["asian", "dumplings", "cocktails"],
    image: "https://images.unsplash.com/photo-1537047902294-62a40c20a6ae?w=600&h=400&fit=crop",
    participatingEvents: [1, 4],
    menu: [
      { category: "Snacks & Dumplings", items: [
        { name: "New England Lobster Roll", price: 34, description: "The iconic roll — buttery, simple, perfect" },
        { name: "Prawn & Chive Dumplings", price: 18, description: "Steamed, XO chilli oil" },
        { name: "Hiramasa Kingfish", price: 22, description: "Wasabi, ginger, soy", isNew: true }
      ]},
      { category: "Large Plates", items: [
        { name: "Roasted Duck Bao", price: 28, description: "Steamed bao, hoisin, cucumber" },
        { name: "Wagyu Tataki", price: 38, description: "Ponzu, daikon, shiso" },
        { name: "Crispy Skin Chicken", price: 42, description: "Half chicken, nahm jim, herbs", isNew: true }
      ]},
      { category: "Drinks", items: [
        { name: "Sake Flight", price: 28, description: "Three premium sakes, tasting notes" },
        { name: "Yuzu Highball", price: 20, description: "Japanese whisky, yuzu, soda" }
      ]}
    ],
    criticReviews: [
      { id: 110, author: "Marcus Wong", role: "Restaurant Critic", date: "2026-03-20", rating: 9, text: "Supernormal remains one of Melbourne's most reliable restaurants. The lobster roll is legendary for a reason. The new crispy skin chicken is a knockout — the best version of this dish in the city. Smart wine and sake list too.", likes: 38, comments: [] }
    ],
    communityReviews: [
      { id: 219, author: "LobsterLover", date: "2026-03-22", rating: 9, text: "That lobster roll haunts my dreams. We ordered two. No regrets.", likes: 14, comments: [] },
      { id: 220, author: "AsianFoodFan", date: "2026-03-10", rating: 8, text: "Consistently great. The dumplings are perfect and the vibe is always buzzing.", likes: 7, comments: [] },
      { id: 221, author: "WineNerd", date: "2026-02-28", rating: 9, text: "Underrated sake list. The sommelier really knows their stuff. Food is the perfect match.", likes: 11, comments: [] }
    ]
  },
  {
    id: 10,
    name: "St Ali",
    type: "cafe",
    suburb: "South Melbourne",
    suburbGroup: "Bayside",
    address: "12-18 Yarra Pl, South Melbourne VIC 3205",
    lat: -37.8340, lng: 144.9590,
    description: "Pioneering specialty coffee roaster and all-day cafe. A Melbourne coffee institution since 2005.",
    phone: "(03) 9686 2990",
    hours: "Daily 7am–5pm",
    priceRange: "$$",
    tags: ["coffee", "brunch", "institution"],
    image: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=600&h=400&fit=crop",
    participatingEvents: [3],
    menu: [
      { category: "Breakfast", items: [
        { name: "Avo Toast Deluxe", price: 23, description: "Sourdough, avocado, dukkah, poached eggs, feta" },
        { name: "Pork Belly Hash", price: 26, description: "Crispy pork belly, potato hash, fried egg, chimichurri", isNew: true },
        { name: "Smoothie Bowl", price: 18, description: "Pitaya, banana, granola, coconut" }
      ]},
      { category: "Lunch", items: [
        { name: "Wagyu Burger", price: 26, description: "Smashed patty, American cheese, pickles, special sauce" },
        { name: "Buddha Bowl", price: 22, description: "Quinoa, roasted veg, tahini, seeds" }
      ]},
      { category: "Coffee", items: [
        { name: "Espresso", price: 4.5, description: "St Ali house blend" },
        { name: "Pourover", price: 7, description: "Single origin, Kalita Wave" },
        { name: "Affogato", price: 8, description: "Espresso over vanilla gelato" }
      ]}
    ],
    criticReviews: [
      { id: 111, author: "Priya Sharma", role: "Cafe Specialist", date: "2026-03-12", rating: 8, text: "St Ali remains a cornerstone of Melbourne's coffee culture. The new pork belly hash is excellent — crispy, rich, and well-balanced. Coffee quality is still top-tier. The space gets hectic on weekends but it's part of the charm.", likes: 20, comments: [] }
    ],
    communityReviews: [
      { id: 222, author: "CoffeePilgrim", date: "2026-03-15", rating: 9, text: "The OG of Melbourne coffee. Pourover here is a spiritual experience.", likes: 12, comments: [] },
      { id: 223, author: "SouthMelbResident", date: "2026-03-08", rating: 8, text: "Great local spot. Wagyu burger for lunch is surprisingly good. Coffee never disappoints.", likes: 5, comments: [] }
    ]
  },
  {
    id: 11,
    name: "Embla",
    type: "restaurant",
    suburb: "Melbourne CBD",
    suburbGroup: "CBD & Inner City",
    address: "122 Russell St, Melbourne VIC 3000",
    lat: -37.8145, lng: 144.9695,
    description: "Natural wine bar with exceptional wood-fired cooking. Small, ever-changing menu driven by seasonality and fire.",
    phone: "(03) 9654 5923",
    hours: "Mon–Sat 12pm–late",
    priceRange: "$$$",
    tags: ["natural wine", "wood-fired", "seasonal"],
    image: "https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?w=600&h=400&fit=crop",
    participatingEvents: [4],
    menu: [
      { category: "Wood-Fired", items: [
        { name: "Grilled Octopus", price: 28, description: "Romesco, capers, char-grilled lemon" },
        { name: "Ember-Roasted Carrots", price: 18, description: "Harissa yoghurt, dukkah, mint", isNew: true },
        { name: "Whole Grilled Fish", price: 44, description: "Market fish, salsa verde, charred lemon" }
      ]},
      { category: "Shared", items: [
        { name: "House Focaccia", price: 12, description: "Whipped ricotta, honey, sea salt" },
        { name: "Burrata", price: 24, description: "Heirloom tomatoes, basil, olive oil" }
      ]},
      { category: "Wine", items: [
        { name: "Wine by the Glass", price: 16, description: "Rotating natural wines — ask staff" },
        { name: "Tasting Flight", price: 32, description: "Three glasses, sommelier's choice" }
      ]}
    ],
    criticReviews: [
      { id: 112, author: "Sarah Chen", role: "Committee Lead", date: "2026-03-18", rating: 9, text: "Embla captures everything I love about Melbourne dining — unfussy, seasonal, and built around fire. The new ember-roasted carrots are stunning in their simplicity. The natural wine list is one of the most exciting in the city.", likes: 33, comments: [] }
    ],
    communityReviews: [
      { id: 224, author: "WineWitch", date: "2026-03-21", rating: 10, text: "My happy place. The natural wine list changes constantly and is always interesting. Food from the fire is incredible.", likes: 19, comments: [] },
      { id: 225, author: "FirstTimer", date: "2026-03-12", rating: 8, text: "Went on a friend's recommendation. The focaccia with ricotta is heavenly. Wish it was bigger!", likes: 6, comments: [] }
    ]
  },
  {
    id: 12,
    name: "Hammer & Tong",
    type: "cafe",
    suburb: "Fitzroy",
    suburbGroup: "Inner North",
    address: "412 Brunswick St, Fitzroy VIC 3065",
    lat: -37.7950, lng: 144.9780,
    description: "Cosy Brunswick Street cafe known for its hearty brunch, rotating specials, and excellent coffee programme.",
    phone: "(03) 9041 5556",
    hours: "Daily 7am–4pm",
    priceRange: "$$",
    tags: ["brunch", "coffee", "cosy"],
    image: "https://images.unsplash.com/photo-1445116572660-236099ec97a0?w=600&h=400&fit=crop",
    participatingEvents: [2],
    menu: [
      { category: "Brunch", items: [
        { name: "Brisket Hash", price: 24, description: "Slow-smoked brisket, potato, poached eggs, chipotle hollandaise", isNew: true },
        { name: "Mushroom Toast", price: 21, description: "Mixed mushrooms, ricotta, truffle, sourdough" },
        { name: "Banana Bread", price: 14, description: "House-baked, mascarpone, berries" }
      ]},
      { category: "Lunch", items: [
        { name: "Fried Chicken Burger", price: 22, description: "Buttermilk chicken, slaw, pickles, brioche" },
        { name: "Halloumi Salad", price: 20, description: "Grilled halloumi, quinoa, roasted veg, lemon" }
      ]},
      { category: "Coffee", items: [
        { name: "Flat White", price: 5, description: "Small Batch roast" },
        { name: "Chai Latte", price: 5.5, description: "House-made spiced chai" }
      ]}
    ],
    criticReviews: [
      { id: 113, author: "James Patel", role: "Food Critic", date: "2026-03-14", rating: 8, text: "Hammer & Tong is unpretentious comfort food done right. The new brisket hash is hearty and deeply flavourful — real smoked brisket, not an afterthought. Good coffee, friendly staff, no fuss.", likes: 16, comments: [] }
    ],
    communityReviews: [
      { id: 226, author: "FitzroyFoodie", date: "2026-03-16", rating: 9, text: "Best brunch on Brunswick St. The mushroom toast is incredible and the banana bread is a must.", likes: 10, comments: [] },
      { id: 227, author: "MorningPerson", date: "2026-03-05", rating: 8, text: "Love this spot. Cosy on a rainy day, great coffee, and the brisket hash is a game-changer.", likes: 4, comments: [] }
    ]
  }
];

const EVENTS = [
  {
    id: 1,
    name: "CBD Food Playoff: Best Dish Under $30",
    date: "2026-04-12",
    time: "12:00 PM – 6:00 PM",
    suburb: "Melbourne CBD",
    suburbGroup: "CBD & Inner City",
    description: "Our biggest event yet! Five CBD restaurants go head-to-head with their best dish under $30. Community votes decide the winner. Visit each venue, rate each dish on the app, and crown the champion at our 6pm gathering at Federation Square.",
    venueIds: [1, 3, 5, 9],
    image: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&h=400&fit=crop",
    type: "Food Playoff",
    capacity: 200,
    registered: 147,
    status: "upcoming"
  },
  {
    id: 2,
    name: "Inner North Coffee Crawl",
    date: "2026-04-05",
    time: "8:00 AM – 1:00 PM",
    suburb: "Fitzroy & Collingwood",
    suburbGroup: "Inner North",
    description: "Join us for a walking tour of the Inner North's best coffee spots. Start at Proud Mary, work through Cibi, Hammer & Tong, and Lune, with expert tasting notes from our committee. Learn about roasting, brewing methods, and what makes Melbourne coffee world-class.",
    venueIds: [2, 6, 8, 12],
    image: "https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=600&h=400&fit=crop",
    type: "Coffee Crawl",
    capacity: 50,
    registered: 48,
    status: "upcoming"
  },
  {
    id: 3,
    name: "Brunch Battle: North vs South",
    date: "2026-04-19",
    time: "9:00 AM – 2:00 PM",
    suburb: "Multiple Suburbs",
    suburbGroup: "Inner North",
    description: "North Melbourne vs South Melbourne in the ultimate brunch showdown! Teams visit assigned venues, score dishes on creativity, flavour, and presentation. Points tallied for a final leaderboard reveal at 2pm. Bragging rights are everything.",
    venueIds: [1, 4, 6, 10],
    image: "https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?w=600&h=400&fit=crop",
    type: "Food Playoff",
    capacity: 100,
    registered: 72,
    status: "upcoming"
  },
  {
    id: 4,
    name: "Fine Dining Showcase: Chef's Table Experience",
    date: "2026-05-03",
    time: "6:30 PM – 10:30 PM",
    suburb: "Various",
    suburbGroup: "CBD & Inner City",
    description: "An exclusive evening celebrating Melbourne's finest restaurants. Rotating chef's table experiences at Attica, Tipo 00, Supernormal, and Embla. Limited to 30 guests per venue. Each chef presents a special 4-course menu with wine pairing and behind-the-scenes kitchen access.",
    venueIds: [5, 7, 9, 11],
    image: "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600&h=400&fit=crop",
    type: "Exclusive Dining",
    capacity: 120,
    registered: 89,
    status: "upcoming"
  },
  {
    id: 5,
    name: "Summer Street Food Festival",
    date: "2026-02-15",
    time: "4:00 PM – 10:00 PM",
    suburb: "South Melbourne",
    suburbGroup: "Bayside",
    description: "Our inaugural street food festival was a smash hit! 12 vendors, live music, and over 500 attendees. Check out the photos and reviews below.",
    venueIds: [10],
    image: "https://images.unsplash.com/photo-1565123409695-7b5ef63a2efb?w=600&h=400&fit=crop",
    type: "Festival",
    capacity: 500,
    registered: 500,
    status: "past"
  }
];

const SUBURB_GROUPS = [
  { name: "CBD & Inner City", suburbs: ["Melbourne CBD", "Southbank", "Docklands"] },
  { name: "Inner North", suburbs: ["Fitzroy", "Collingwood", "North Melbourne", "Carlton", "Brunswick"] },
  { name: "Bayside", suburbs: ["South Melbourne", "St Kilda", "Ripponlea", "Brighton", "Elwood"] },
  { name: "Inner East", suburbs: ["Richmond", "South Yarra", "Prahran", "Toorak"] },
  { name: "Inner West", suburbs: ["Footscray", "Seddon", "Yarraville", "Williamstown"] }
];

const CRITICS = [
  { name: "Sarah Chen", role: "Committee Lead", bio: "Food writer and community organiser. 15 years exploring Melbourne's food scene.", avatar: "SC" },
  { name: "Marcus Wong", role: "Restaurant Critic", bio: "Former chef turned critic. Specialises in Asian cuisine and fine dining.", avatar: "MW" },
  { name: "Priya Sharma", role: "Cafe Specialist", bio: "Coffee obsessive and brunch expert. Visits 5+ cafes per week.", avatar: "PS" },
  { name: "James Patel", role: "Food Critic", bio: "Journalist covering Melbourne's food industry for 10 years.", avatar: "JP" }
];


// ==================== FACE-OFF BRACKET DATA ====================
// Bracket matches for the CBD Food Playoff (Event 1)
// Venues: Higher Ground (1), Chin Chin (3), Tipo 00 (5), Supernormal (9)

const FACE_OFF_MATCHES = [
  {
    id: 'semi-1',
    eventId: 1,
    round: 'semi',
    label: 'Semifinal 1',
    venueA: 1,  // Higher Ground
    venueB: 3,  // Chin Chin
    votesA: 67,
    votesB: 54,
    winner: null,
    active: true
  },
  {
    id: 'semi-2',
    eventId: 1,
    round: 'semi',
    label: 'Semifinal 2',
    venueA: 5,  // Attica
    venueB: 9,  // Supernormal
    votesA: 43,
    votesB: 58,
    winner: null,
    active: true
  },
  {
    id: 'final',
    eventId: 1,
    round: 'final',
    label: 'Grand Final',
    venueA: null,  // Winner of semi-1
    venueB: null,  // Winner of semi-2
    votesA: 0,
    votesB: 0,
    winner: null,
    active: false
  }
];


// ==================== TEAM / ABOUT DATA ====================

const TEAM_MEMBERS = [
  {
    name: "Amara Osei",
    role: "Founder & Editor-in-Chief",
    bio: "Started Bite Club in 2024 after a decade of food writing. Believes every neighbourhood deserves a great local — and the community to celebrate it.",
    avatar: "AO",
    favouriteVenue: 1  // Higher Ground
  },
  {
    name: "Liam Chen",
    role: "Head of Events",
    bio: "Former hospitality manager who now designs food experiences. If there's a playoff or crawl happening, Liam built it.",
    avatar: "LC",
    favouriteVenue: 3  // Chin Chin
  },
  {
    name: "Fatima Al-Rashid",
    role: "Community Manager",
    bio: "Connects foodies across Melbourne. Manages our reviewer community and ensures every voice is heard.",
    avatar: "FA",
    favouriteVenue: 8  // Proud Mary
  },
  {
    name: "Raj Kapoor",
    role: "Lead Developer",
    bio: "Built the platform from scratch. Fuelled by flat whites and a belief that food discovery should feel as good as the food itself.",
    avatar: "RK",
    favouriteVenue: 2  // Lune Croissanterie
  },
  {
    name: "Sophie Nguyen",
    role: "Partnerships & Growth",
    bio: "Works with venues and brands to bring exclusive experiences to the Bite Club community. Eats out 6 nights a week.",
    avatar: "SN",
    favouriteVenue: 5  // Attica
  }
];


// ==================== SITE CONFIG ====================

const SITE_CONFIG = {
  siteName: "Bite Club",
  tagline: "Discover \u00B7 Review \u00B7 Connect",
  city: "Melbourne",
  founded: 2024,
  description: "Melbourne's food community platform. Discover the best cafes and restaurants, read trusted reviews, and join food events.",
  social: {
    instagram: "@biteclubmelb",
    email: "hello@biteclub.melbourne"
  }
};
