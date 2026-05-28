import Navbar from "./components/navbar";
import Hero from "./components/hero";
import FeaturesGrid from "./components/features-grid";
import ModelStats from "./components/model-stats";
import FeaturesExplanation from "./components/features-explanation";
import CTA from "./components/cta";
import Footer from "./components/footer";

export default function Home() {
  return (
    <div className="min-h-screen selection:bg-mint/30 selection:text-white">
      <Navbar />
      <Hero />
      <FeaturesGrid />
      <ModelStats />
      <FeaturesExplanation />
      <CTA />
      <Footer />
    </div>
  );
}
