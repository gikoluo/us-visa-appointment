const puppeteer = require('puppeteer');
const parseArgs = require('minimist');
const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('node:fs');

(async () => {
    //#region Command line args
    const args = parseArgs(process.argv.slice(2), {string: ['u', 'p', 'c', 'a', 'n', 'm', 'd', 'r'], boolean: ['g']})
    const currentDate = new Date(args.d);
    const usernameInput = args.u;
    const passwordInput = args.p;
    const appointmentId = args.a;
    const retryTimeout = args.t * 1000;
    const consularId = args.c;
    const groupAppointment = args.g;
    const region = args.r;
    const telegramToken = args.n;
    const telegramGroupId = args.m;
    
    //#endregion
	
    //#region Helper functions
    async function waitForSelectors(selectors, frame, options) {
      for (const selector of selectors) {
        try {
          return await waitForSelector(selector, frame, options);
        } catch (err) {
        }
      }
      throw new Error('Could not find element for selectors: ' + JSON.stringify(selectors));
    }

    async function scrollIntoViewIfNeeded(element, timeout) {
      await waitForConnected(element, timeout);
      const isInViewport = await element.isIntersectingViewport({threshold: 0});
      if (isInViewport) {
        return;
      }
      await element.evaluate(element => {
        element.scrollIntoView({
          block: 'center',
          inline: 'center',
          behavior: 'auto',
        });
      });
      await waitForInViewport(element, timeout);
    }

    async function waitForConnected(element, timeout) {
      await waitForFunction(async () => {
        return await element.getProperty('isConnected');
      }, timeout);
    }

    async function waitForInViewport(element, timeout) {
      await waitForFunction(async () => {
        return await element.isIntersectingViewport({threshold: 0});
      }, timeout);
    }

    async function waitForSelector(selector, frame, options) {
      if (!Array.isArray(selector)) {
        selector = [selector];
      }
      if (!selector.length) {
        throw new Error('Empty selector provided to waitForSelector');
      }
      let element = null;
      for (let i = 0; i < selector.length; i++) {
        const part = selector[i];
        if (element) {
          element = await element.waitForSelector(part, options);
        } else {
          element = await frame.waitForSelector(part, options);
        }
        if (!element) {
          throw new Error('Could not find element: ' + selector.join('>>'));
        }
        if (i < selector.length - 1) {
          element = (await element.evaluateHandle(el => el.shadowRoot ? el.shadowRoot : el)).asElement();
        }
      }
      if (!element) {
        throw new Error('Could not find element: ' + selector.join('|'));
      }
      return element;
    }

    async function waitForFunction(fn, timeout) {
      let isActive = true;
      setTimeout(() => {
        isActive = false;
      }, timeout);
      while (isActive) {
        const result = await fn();
        if (result) {
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error('Timed out');
    }

    async function sleep(timeout) {
      return await new Promise(resolve => setTimeout(resolve, timeout));
    }

    async function log(msg) {
      const currentDate = '[' + new Date().toLocaleString() + ']';
      console.log(currentDate, msg);
    }

    async function notify(msg) {
      log(msg)
      
      if (!telegramToken || !telegramGroupId) {
        return;
      }
      
      const TelegramBot = require('node-telegram-bot-api');
      const bot = new TelegramBot(telegramToken, {polling: false});
      
      await bot.sendMessage("-" + telegramGroupId, msg);

    }
    //#endregion

    async function runLogic(browser) {
      //#region Init puppeteer
      //const browser = await puppeteer.launch();
      // Comment above line and uncomment following line to see puppeteer in action
      //const browser = await puppeteer.launch({ headless: false });
      const page = await browser.newPage();
      const timeout = 5000;
      const navigationTimeout = 60000;
      const smallTimeout = 100;
      page.setDefaultTimeout(timeout);
      page.setDefaultNavigationTimeout(navigationTimeout);
      page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")
      //#endregion

      //#region Logic
      
      // Check Paused status
      {
        const data = fs.readFileSync('PAUSE', { encoding: 'utf8' });
        log(data)
        if (data.search(usernameInput) > -1) {
          log("Paused account: " + usernameInput)
          return false
        }
      }
      
      // Set the viewport to avoid elements changing places 
      {
          const targetPage = page;
          await targetPage.setViewport({"width":2078,"height":1479})
      }

      // Go to login page
      {
          const targetPage = page;
          await targetPage.goto('https://ais.usvisa-info.com/en-' + region + '/niv/users/sign_in', { waitUntil: 'domcontentloaded' });
      }
      
      // Click on username input
      {
          const targetPage = page;
          const element = await waitForSelectors([["aria/Email *"],["#user_email"]], targetPage, { timeout, visible: true });
          await scrollIntoViewIfNeeded(element, timeout);
          await element.click({ offset: { x: 118, y: 21.453125} });
      }
      
      // Type username
      {
          const targetPage = page;
          const element = await waitForSelectors([["aria/Email *"],["#user_email"]], targetPage, { timeout, visible: true });
          await scrollIntoViewIfNeeded(element, timeout);
          const type = await element.evaluate(el => el.type);
          if (["textarea","select-one","text","url","tel","search","password","number","email"].includes(type)) {
            await element.type(usernameInput);
          } else {
            await element.focus();
            await element.evaluate((el, value) => {
              el.value = value;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }, usernameInput);
          }
      }
	  
      // Hit tab to go to the password input
      {
          const targetPage = page;
          await targetPage.keyboard.down("Tab");
      }
      {
          const targetPage = page;
          await targetPage.keyboard.up("Tab");
      }
	  
      // Type password
      {
          const targetPage = page;
          const element = await waitForSelectors([["aria/Password"],["#user_password"]], targetPage, { timeout, visible: true });
		      await scrollIntoViewIfNeeded(element, timeout);
          const type = await element.evaluate(el => el.type);
          if (["textarea","select-one","text","url","tel","search","password","number","email"].includes(type)) {
            await element.type(passwordInput);
          } else {
            await element.focus();
            await element.evaluate((el, value) => {
              el.value = value;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }, passwordInput);
          }
      }
	  
      // Tick the checkbox for agreement
      {
          const targetPage = page;
          const element = await waitForSelectors([["#sign_in_form > div.radio-checkbox-group.margin-top-30 > label > div"]], targetPage, { timeout, visible: true });
          await scrollIntoViewIfNeeded(element, timeout);
          await element.click({ offset: { x: 9, y: 16.34375} });
      }
      
      // Click login button
      {
          const targetPage = page;
          const element = await waitForSelectors([["aria/Sign In[role=\"button\"]"],["#new_user > p:nth-child(9) > input"]], targetPage, { timeout, visible: true });
          await scrollIntoViewIfNeeded(element, timeout);
          await element.click({ offset: { x: 34, y: 11.34375} });
          await targetPage.waitForNavigation();
          console.log("Login successful!")
      }

      // We are logged in now. Check available dates from the API
      {
          const targetPage = page;
          await targetPage.setExtraHTTPHeaders({'Accept': 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest'});
        
          const response = await targetPage.goto('https://ais.usvisa-info.com/en-' + region + '/niv/schedule/' + appointmentId + '/appointment/days/' + consularId + '.json?appointments[expedite]=false');
          
          console.log("response: ", response.status())
          const availableDates = JSON.parse(await response.text());
          
          console.log("availableDates:", availableDates);

          if (availableDates.length <= 0) {
            log("There are no available dates for consulate with id " + consularId);
            await browser.close();
            return false;
          }
          
          const firstDate = new Date(availableDates[0].date);
          
          //In case the data is not avaiable when choosing date.
          if (firstDate > currentDate) {
            log("There is not an earlier date available than " + currentDate.toISOString().slice(0,10));
            await browser.close();
            return false;
          }
          console.log("Found an earlier date!")

          notify("Found an earlier date! " + firstDate.toISOString().slice(0,10) + " for " + usernameInput);
      }

      // Go to appointment page
      {
          log("Start to make appointment: ", 'https://ais.usvisa-info.com/en-' + region + '/niv/schedule/' + appointmentId + '/appointment')
          const targetPage = page;
          await targetPage.goto('https://ais.usvisa-info.com/en-' + region + '/niv/schedule/' + appointmentId + '/appointment', { waitUntil: 'domcontentloaded' });
          await sleep(smallTimeout);
      }     

      // Select multiple people if it is a group appointment
      {
          log("Select group")
          if(groupAppointment){
            const targetPage = page;
            const element = await waitForSelectors([["aria/Continue"],["#main > div.mainContent > form > div:nth-child(3) > div > input"]], targetPage, { timeout, visible: true });
            await scrollIntoViewIfNeeded(element, timeout);
            await element.click({ offset: { x: 70.515625, y: 25.25} });
            await sleep(smallTimeout);
          }
      }

      // Select the specified consular from the dropdown
      {
          const targetPage = page;
          const element = await waitForSelectors([["aria/Consular Section Appointment","aria/[role=\"combobox\"]"],["#appointments_consulate_appointment_facility_id"]], targetPage, { timeout, visible: true });
          await scrollIntoViewIfNeeded(element, timeout);    
          await page.select("#appointments_consulate_appointment_facility_id", consularId);
          await sleep(smallTimeout);
      }

      // Click on date input
      {
          log("Select date")
          const targetPage = page;
          const element = await waitForSelectors([["aria/Date of Appointment *"],["#appointments_consulate_appointment_date"]], targetPage, { timeout, visible: true });
          await scrollIntoViewIfNeeded(element, timeout);
          await element.click({ offset: { x: 394.5, y: 17.53125} });
          await sleep(smallTimeout);
      }

      // Keep clicking next button until we find the first available date and click to that date
      {
          const targetPage = page;
          while (true) {
            log("Try next step")
            try {
              const element = await waitForSelectors([["aria/25[role=\"link\"]"],["#ui-datepicker-div > div.ui-datepicker-group.ui-datepicker-group > table > tbody > tr > td.undefined > a"]], targetPage, { timeout:smallTimeout, visible: true });
              await scrollIntoViewIfNeeded(element, timeout);
              
              const y = await page.evaluate(el => el.parentNode.getAttribute("data-year"), element);
              const m = await page.evaluate(el => el.parentNode.getAttribute("data-month"), element);
              const d = await page.evaluate(el => el.textContent, element);
              
              const d2 = new Date(y, m, d)
              
              log("Select Date! " + d2)
              
              if ( d2 && d2 < currentDate) {
                log("Go Date! " + d2)
                await page.click('#ui-datepicker-div > div.ui-datepicker-group.ui-datepicker-group > table > tbody > tr > td.undefined > a');
                await sleep(smallTimeout);
                break;
              }
              else {
                log("Date has gone, retry! " + d2)
                await browser.close();
                return false;
              }
            } catch (err) {
              {
                log("Error " + err)
                const targetPage = page;
                const element = await waitForSelectors([["aria/Next","aria/[role=\"generic\"]"],["#ui-datepicker-div > div.ui-datepicker-group.ui-datepicker-group-last > div > a > span"]], targetPage, { timeout, visible: true });
                await scrollIntoViewIfNeeded(element, timeout);
                await element.click({ offset: { x: 4, y: 9.03125} });
              }
            }
          }
      }

      // Select the first available Time from the time dropdown
      {
          log("Select the first available Time from the time dropdown")
          const targetPage = page;
          const element = await waitForSelectors([["#appointments_consulate_appointment_time"]], targetPage, { timeout, visible: true });
          await scrollIntoViewIfNeeded(element, timeout);
          await page.evaluate(() => {
            document.querySelector('#appointments_consulate_appointment_time option:nth-child(2)').selected = true;
            const event = new Event('change', {bubbles: true});
            document.querySelector('#appointments_consulate_appointment_time').dispatchEvent(event);
          })
          await sleep(1000);
      }

      // Click on reschedule button
      {
          log("Click on reschedule button")
          const targetPage = page;
          const element = await waitForSelectors([["aria/Reschedule"],["#appointments_submit"]], targetPage, { timeout, visible: true });
          await scrollIntoViewIfNeeded(element, timeout);
          await element.click({ offset: { x: 78.109375, y: 20.0625} });
          await sleep(1000);
      }

      // Click on submit button on the confirmation popup
      {
        log("Click on submit button")
        const targetPage = page;
        const element = await waitForSelectors([["aria/Cancel"],["body > div.reveal-overlay > div > div > a.button.alert"]], targetPage, { timeout, visible: true });
        await scrollIntoViewIfNeeded(element, timeout);
        await page.click('body > div.reveal-overlay > div > div > a.button.alert');
        await sleep(5000);
      }
      
      log("Done")
      await browser.close();
      return true;
      //#endregion
    }
    
    async function close(browser) {
    const pages = await browser.pages();
      for ( let i=0; i< pages.length; i++ ) {
    await pages[i].close();

      }
      await browser.close();
    }

    while (true){
	    const browser = await puppeteer.launch ( { headless: true });
      try{
        const result = await runLogic(browser);

        if (result){
          notify("Successfully scheduled a new appointment" + " for " + usernameInput);
          const content = usernameInput
          fs.writeFile('PAUSE', content, err => {
            if (err) {
              console.error(err);
            } else {
            }
          });
          break;
        }
      } catch (err){
        log(err)
        // Swallow the error and keep running in case we encountered an error.
      } finally {
        close ( browser );
      }

      await sleep(retryTimeout);
    }
})();