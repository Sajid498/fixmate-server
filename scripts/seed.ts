
import "dotenv/config";
import { ObjectId } from "mongodb";
import { closeDatabase, connectDatabase, getDatabase } from "../src/config/database.js";

const serviceTemplates = [
  {
    title: "Professional Smartphone Screen Repair",
    category: "Smartphone",
    description: "Professional replacement and repair of cracked, damaged, or unresponsive smartphone screens with careful device inspection.",
    image: "https://placehold.co/800x600/png?text=Smartphone+Screen+Repair",
    basePrice: 1800,
    estimatedDuration: "1-2 hours",
    serviceMode: "Shop Drop-off",
    serviceArea: "Dhanmondi, Dhaka",
  },
  {
    title: "Smartphone Battery Replacement",
    category: "Smartphone",
    description: "Battery health inspection and replacement service for smartphones experiencing rapid battery drain or charging problems.",
    image: "https://placehold.co/800x600/png?text=Battery+Replacement",
    basePrice: 1200,
    estimatedDuration: "1 hour",
    serviceMode: "Shop Drop-off",
    serviceArea: "Mirpur, Dhaka",
  },
  {
    title: "Laptop Hardware Diagnosis and Repair",
    category: "Laptop & PC",
    description: "Complete laptop hardware inspection and repair for overheating, unexpected shutdowns, damaged components, and performance issues.",
    image: "https://placehold.co/800x600/png?text=Laptop+Repair",
    basePrice: 1500,
    estimatedDuration: "2-4 hours",
    serviceMode: "Shop Drop-off",
    serviceArea: "Uttara, Dhaka",
  },
  {
    title: "Laptop Windows and Software Support",
    category: "Laptop & PC",
    description: "Operating system installation, driver configuration, software troubleshooting, and laptop performance optimization.",
    image: "https://placehold.co/800x600/png?text=Computer+Support",
    basePrice: 1000,
    estimatedDuration: "1-2 hours",
    serviceMode: "Shop Drop-off",
    serviceArea: "Mohammadpur, Dhaka",
  },
  {
    title: "Home Air Conditioner Servicing",
    category: "AC",
    description: "Home air conditioner cleaning, filter inspection, cooling performance diagnosis, and routine maintenance by an experienced technician.",
    image: "https://placehold.co/800x600/png?text=AC+Servicing",
    basePrice: 1800,
    estimatedDuration: "1-2 hours",
    serviceMode: "Home Visit",
    serviceArea: "Gulshan, Dhaka",
  },
  {
    title: "Air Conditioner Installation and Repair",
    category: "AC",
    description: "Air conditioner installation inspection, cooling issue diagnosis, electrical connection checking, and general repair assistance.",
    image: "https://placehold.co/800x600/png?text=AC+Installation",
    basePrice: 2500,
    estimatedDuration: "2-3 hours",
    serviceMode: "Home Visit",
    serviceArea: "Banani, Dhaka",
  },
  {
    title: "Refrigerator Cooling Problem Repair",
    category: "Refrigerator",
    description: "Diagnosis and repair of refrigerator cooling problems, unusual noises, temperature issues, and common electrical faults.",
    image: "https://placehold.co/800x600/png?text=Refrigerator+Repair",
    basePrice: 1600,
    estimatedDuration: "2-3 hours",
    serviceMode: "Home Visit",
    serviceArea: "Bashundhara, Dhaka",
  },
  {
    title: "Refrigerator Maintenance Service",
    category: "Refrigerator",
    description: "Preventive refrigerator maintenance including inspection, cleaning guidance, cooling checks, and basic component diagnosis.",
    image: "https://placehold.co/800x600/png?text=Refrigerator+Maintenance",
    basePrice: 1000,
    estimatedDuration: "1-2 hours",
    serviceMode: "Home Visit",
    serviceArea: "Badda, Dhaka",
  },
  {
    title: "LED and Smart TV Repair",
    category: "TV",
    description: "Professional diagnosis of LED and smart television display, sound, connectivity, and power-related problems.",
    image: "https://placehold.co/800x600/png?text=Television+Repair",
    basePrice: 1400,
    estimatedDuration: "2-3 hours",
    serviceMode: "Shop Drop-off",
    serviceArea: "Farmgate, Dhaka",
  },
  {
    title: "Washing Machine Repair",
    category: "Washing Machine",
    description: "Repair assistance for washing machines with drainage, spinning, water supply, vibration, and electrical problems.",
    image: "https://placehold.co/800x600/png?text=Washing+Machine+Repair",
    basePrice: 1700,
    estimatedDuration: "2-3 hours",
    serviceMode: "Home Visit",
    serviceArea: "Khilgaon, Dhaka",
  },
  {
    title: "Home Electrical Troubleshooting",
    category: "Electrical",
    description: "Home electrical troubleshooting covering faulty switches, lighting problems, socket issues, and basic wiring inspection.",
    image: "https://placehold.co/800x600/png?text=Electrical+Repair",
    basePrice: 900,
    estimatedDuration: "1-2 hours",
    serviceMode: "Home Visit",
    serviceArea: "Rampura, Dhaka",
  },
  {
    title: "Electrical Appliance Safety Inspection",
    category: "Electrical",
    description: "Inspection of household electrical appliances, power connections, wiring conditions, and common electrical safety concerns.",
    image: "https://placehold.co/800x600/png?text=Electrical+Inspection",
    basePrice: 1200,
    estimatedDuration: "1-2 hours",
    serviceMode: "Home Visit",
    serviceArea: "Shyamoli, Dhaka",
  },
] as const;

const bookingTemplates = [
  {
    key: "requested",
    status: "requested",
    description: "The customer has submitted a repair request and is waiting for technician confirmation.",
    days: 7,
  },
  {
    key: "accepted",
    status: "accepted",
    description: "The technician has accepted this repair request and will contact the customer.",
    days: 8,
  },
  {
    key: "in-progress",
    status: "in-progress",
    description: "The technician is currently inspecting and repairing the customer's device.",
    days: 9,
  },
  {
    key: "completed",
    status: "completed",
    description: "The repair has been completed and is awaiting customer payment.",
    days: 5,
  },
  {
    key: "rejected",
    status: "rejected",
    description: "The technician reviewed the request but cannot accept this repair job.",
    days: 6,
  },
] as const;

async function seedDatabase() {
  await connectDatabase();

  const database = getDatabase();
  const usersCollection = database.collection("users");
  const servicesCollection = database.collection("services");
  const bookingsCollection = database.collection("bookings");

  const technicians = await usersCollection
    .find({ role: "technician" })
    .sort({ createdAt: 1 })
    .limit(2)
    .toArray();

  const customer = await usersCollection.findOne({ role: "customer" });

  if (technicians.length < 2) {
    throw new Error(
      "At least two registered technician accounts are required. Register two technicians before running the seed script.",
    );
  }

  if (!customer) {
    throw new Error(
      "At least one registered customer account is required. Register a customer before running the seed script.",
    );
  }

  const technicianAccounts = technicians.map((technician) => ({
    name: String(technician.name || "FixMate Technician"),
    email: String(technician.email),
  }));

  const customerAccount = {
    name: String(customer.name || "FixMate Customer"),
    email: String(customer.email),
  };

  const seededServices: Array<{
    _id: ObjectId;
    title: string;
    category: string;
    basePrice: number;
    image: string;
    technicianName: string;
    technicianEmail: string;
  }> = [];

  for (let index = 0; index < serviceTemplates.length; index += 1) {
    const template = serviceTemplates[index];
    const technician = technicianAccounts[index % technicianAccounts.length];
    const seedKey = `fixmate-demo-service-${index + 1}`;

    const serviceDocument = {
      ...template,
      technicianName: technician.name,
      technicianEmail: technician.email,
      approvalStatus: "approved",
      isAvailable: true,
      seedKey,
      createdAt: new Date(Date.now() - index * 60 * 60 * 1000),
    };

    await servicesCollection.updateOne(
      { seedKey },
      { $setOnInsert: serviceDocument },
      { upsert: true },
    );

    const savedService = await servicesCollection.findOne({ seedKey });

    if (!savedService) {
      throw new Error(`Unable to retrieve seeded service: ${seedKey}`);
    }

    seededServices.push({
      _id: savedService._id,
      title: String(savedService.title),
      category: String(savedService.category),
      basePrice: Number(savedService.basePrice),
      image: String(savedService.image),
      technicianName: String(savedService.technicianName),
      technicianEmail: String(savedService.technicianEmail),
    });
  }

  const now = Date.now();

  for (let index = 0; index < bookingTemplates.length; index += 1) {
    const template = bookingTemplates[index];
    const service = seededServices[index];
    const preferredDate = new Date(now + template.days * 24 * 60 * 60 * 1000);

    const bookingDocument = {
      seedKey: `fixmate-demo-booking-${template.key}`,
      serviceId: service._id.toString(),
      serviceTitle: service.title,
      serviceImage: service.image,
      category: service.category,
      basePrice: service.basePrice,
      technicianName: service.technicianName,
      technicianEmail: service.technicianEmail,
      customerName: customerAccount.name,
      customerEmail: customerAccount.email,
      customerPhone: String(customer.phone || "01800000000"),
      address: "House 10, Road 5, Dhanmondi, Dhaka",
      preferredDate,
      problemDescription: template.description,
      status: template.status,
      finalAmount: service.basePrice,
      paymentStatus: "unpaid",
      createdAt: new Date(now - (index + 1) * 60 * 60 * 1000),
      updatedAt: new Date(),
    };

    await bookingsCollection.updateOne(
      { seedKey: bookingDocument.seedKey },
      { $setOnInsert: bookingDocument },
      { upsert: true },
    );
  }

  console.log("FixMate seed completed successfully.");
  console.log(`Technicians used: ${technicianAccounts.length}`);
  console.log(`Customer used: ${customerAccount.email}`);
  console.log(`Approved demo services: ${seededServices.length}`);
  console.log(`Demo bookings: ${bookingTemplates.length}`);
}

seedDatabase()
  .catch((error: unknown) => {
    console.error("FixMate seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
