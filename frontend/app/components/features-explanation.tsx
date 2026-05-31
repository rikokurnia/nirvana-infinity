"use client";

export default function FeaturesExplanation() {
  return (
    <section className="max-w-4xl mx-auto py-32 px-6 text-center border-y border-hairline-soft mt-24">
      <h2 className="font-headline text-4xl mb-8 font-bold tracking-tight">
        How Nirvana Works
      </h2>
      <p className="font-sans text-lg text-on-surface-variant leading-relaxed mb-12">
        Nirvana replaces the old way of paying teams — the risky cliff-based vesting — with an automated system that keeps everyone aligned. Founders set up streaming payments with three flexible models:{" "}
        <span className="text-mint font-bold">Ascend</span> (performance-based),{" "}
        <span className="text-mint font-bold">Balance</span> (steady + upside), and{" "}
        <span className="text-mint font-bold">Flow</span> (continuous payout). Everything runs on code, not politics.
      </p>
      <div className="flex flex-wrap justify-center gap-16 opacity-30 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-500 cursor-pointer">
        {[
          "https://lh3.googleusercontent.com/aida-public/AB6AXuCtAPZrSZvyDTBx5VziJlmZSeRWq-3vJTvwfXsKUiF8FG-SxiqmFtPYBUBsuIJQkDAO9ZJXuseMAWZ5TYWgGzuo-TZ2Uba-FtnQJnsrQdw8Zo2smp35GBNB2KOA-_cJ1axd0xrkY8-Jr2WW66hIKYMhkIup9lfMCHWYOeJqoKQKryh3WIZWvMYe100O_hRLarH-k15daWmUmahd1fmgPZa7gr3pzUfVY00PvE0sSJndXM652_bPB_3qus7kySM7x-ymKVGth-lJFTXN",
          "https://lh3.googleusercontent.com/aida-public/AB6AXuDw8qx6T-VjOFC5mQpQfj0GcxdwG1k-CQgSgHV9qsraZHYzVo7HcPtuDCn6ZvcGspXw3XbDrKkaFaDBYiTtjga3iSco95fxIWY5XVw-rwxQw3otKxHysFMLk2CmhYSx8O6rX9fd8-ySqgyccndDg92U0Jtv66f6bD7PK_pz_nj-rInDrkQVDxMqPnAb42thHuTF1LlOpNkv_m64scGFPY38HlDdAPiuTnyIYu6Y3FAAtnSm9VVcWq2afONTLyrfqCFiMIOtM-TPqgXx",
          "https://lh3.googleusercontent.com/aida-public/AB6AXuD6KjfcBzKT8h03wwTGInk9rVwb7J2aHtiMx1VdbDAG-UObmrWCXaAyBfm3jGwXBrIGkgkVDYgR9CpSO1lLP1ZUH20amQftrpsd-LzKhBQs9l0TWQy4ACtvy0D4tNjTe4M5sY-3aYdl-pRNJ6Q_pQFYCv8lhWySEHrymfiRxW4MpK1Ov0hfaXgFqy9m5a7MQ0uvlHOL7QEeQ3G0PTy9KsvsbAsife1XamWF8jD-JS9lSKF_rf6karYuANTT9_r2UZG9Ps23tobBVIn0",
          "https://lh3.googleusercontent.com/aida-public/AB6AXuDOTPYrdYQI6noYswIlB_bGbdN29YDTiOB8ZMWolsEbZ4fNkn8ytT3mHQD8fypHTpszxtl7Sd4t4vOMje_XLHfCXtJD880qdqVjgOvU_kWL5bMp_59ae8MXteUI6QTdf3N_wNlHL7rxZr-DAj0XCYfU01IhRYqTN9Oboa-JYyFSJ55QYpP7xLxJmFtgiSrKwjbQLdGv7x8vWAXsW6VrDEC8PIeopqFCuIs1caMfoIbS7NUTS55Hkyw_I1kU1YNo7G_Gaia6VIOkJJji",
        ].map((logo, i) => (
          <img key={i} src={logo} alt="partner" className="h-6 object-contain" />
        ))}
      </div>
    </section>
  );
}
