import Header from './Header';
import Section from './Section';

const Support = () => {
  return (
    <div className="pt-[4.75rem] lg:pt-[5.25rem] overflow-hidden">
      <Header />
      
      <Section className="pt-[12rem] -mt-[5.25rem]" crosses crossesOffset="lg:translate-y-[5.25rem]" customPaddings id="support">
        <div className="container">
          <div className="text-center mb-[4rem]">
            <h1 className="h1 mb-6">Support</h1>
            <p className="body-1 text-n-4">
              Need help? Our support team is here to assist you.
            </p>
          </div>

          <div className="max-w-3xl mx-auto">
            <div className="bg-n-7 border border-n-6 rounded-2xl p-8">
              <h2 className="h3 mb-4">Get in Touch</h2>
              <p className="body-2 text-n-4 mb-6">
                We're currently setting up our support system. In the meantime, please check back soon for assistance options.
              </p>
              
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-color-4/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-color-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-n-1 mb-1">Email Support</h3>
                    <p className="text-n-4">Coming soon</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-color-5/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-color-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-n-1 mb-1">Live Chat</h3>
                    <p className="text-n-4">Coming soon</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-color-1/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-color-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-n-1 mb-1">Discord</h3>
                    <a
                      className="text-n-4 hover:text-color-1 transition-colors"
                      href="https://discord.gg/4htgqJZtce"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Join the Handshake community
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
};

export default Support;
